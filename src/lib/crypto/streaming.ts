/**
 * TSL1 streaming AEAD format for client-side file encryption.
 *
 * One AES-256-GCM call per chunk, so the file never has to be held in memory as
 * a whole. This removes the browser-heap ceiling that made large transfers
 * OOM-crash the tab. See docs/audit/26-streaming-encryption-design.md (§4 frame
 * format, §13 for the grilling refinements this implements).
 *
 * Wire layout:
 *   header (20 B): magic "TSL1" (4) | version (1) | reserved (3) |
 *                  base_iv (8) | chunk_size u32 little-endian (4)
 *   then, per chunk i: ciphertext_i || tag_i (16 B)
 *
 * Per chunk: IV  = base_iv (8 B) || counter_be_u32(i)        (12 B, NIST SP 800-38D)
 *            AAD = magic | version | counter_be_u32(i) | is_final   (10 B)
 *
 * is_final is positional (i === N - 1), where N is derived from the known
 * plaintext size on encrypt and from the known ciphertext length on decrypt.
 * Binding index + finality into the AAD makes the GCM tag catch reorder,
 * truncation, replay, and downgrade. Nonce uniqueness is guaranteed by the
 * counter over a single-use per-file key.
 */

const MAGIC = new Uint8Array([0x54, 0x53, 0x4c, 0x31]); // "TSL1"
const VERSION = 0x01;
export const HEADER_SIZE = 20;
const TAG_SIZE = 16; // 128-bit GCM tag, WebCrypto default
const BASE_IV_SIZE = 8;
const IV_SIZE = 12;
const AAD_SIZE = 10;

/** Plaintext bytes per chunk. Stored in the header so the decryptor reads it back. */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB
const MAX_CHUNK_SIZE = 64 * 1024 * 1024; // decrypt-side sanity bound

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function chunkCount(plaintextSize: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(plaintextSize / chunkSize));
}

/**
 * Exact ciphertext size for a given plaintext size. Lets the caller request
 * multipart Part URLs up front without encrypting a byte, so the existing
 * upload flow is unchanged.
 */
export function framedSize(plaintextSize: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
  return HEADER_SIZE + plaintextSize + TAG_SIZE * chunkCount(plaintextSize, chunkSize);
}

/** True if these leading bytes carry the TSL1 magic (dispatch legacy vs streaming on download). */
export function isStreamingFormat(firstBytes: Uint8Array): boolean {
  if (firstBytes.length < 4) return false;
  return (
    firstBytes[0] === MAGIC[0] &&
    firstBytes[1] === MAGIC[1] &&
    firstBytes[2] === MAGIC[2] &&
    firstBytes[3] === MAGIC[3]
  );
}

function buildHeader(baseIv: Uint8Array, chunkSize: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(HEADER_SIZE);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  // bytes 5..7 are reserved, left zero
  header.set(baseIv, 8);
  new DataView(header.buffer).setUint32(16, chunkSize, true); // little-endian
  return header;
}

function ivFor(baseIv: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(IV_SIZE);
  iv.set(baseIv, 0);
  new DataView(iv.buffer).setUint32(BASE_IV_SIZE, index, false); // big-endian counter
  return iv;
}

function aadFor(index: number, isFinal: boolean): Uint8Array<ArrayBuffer> {
  const aad = new Uint8Array(AAD_SIZE);
  aad.set(MAGIC, 0);
  aad[4] = VERSION;
  new DataView(aad.buffer).setUint32(5, index, false); // big-endian
  aad[9] = isFinal ? 1 : 0;
  return aad;
}

/**
 * Encrypts a plaintext byte stream into a TSL1 ciphertext stream. Memory stays
 * bounded to roughly one chunk regardless of file size. `plaintextSize` is the
 * exact source length (e.g. `file.size`); it drives positional finality.
 */
function streamingEncryptWithIv(
  source: ReadableStream<Uint8Array>,
  plaintextSize: number,
  key: CryptoKey,
  baseIv: Uint8Array,
  chunkSize: number,
): ReadableStream<Uint8Array> {
  const total = chunkCount(plaintextSize, chunkSize);
  const reader = source.getReader();
  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let index = 0;
  let headerSent = false;
  let sourceDone = false;

  async function fill(target: number): Promise<void> {
    while (buffer.length < target && !sourceDone) {
      const { done, value } = await reader.read();
      if (done) {
        sourceDone = true;
        break;
      }
      if (value && value.length) buffer = concat(buffer, value);
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        controller.enqueue(buildHeader(baseIv, chunkSize));
        headerSent = true;
        return;
      }

      const isFinal = index === total - 1;
      await fill(chunkSize);

      if (!isFinal && buffer.length < chunkSize) {
        await reader.cancel().catch(() => {});
        controller.error(new Error("streamingEncrypt: source shorter than declared size"));
        return;
      }

      const take = isFinal ? Math.min(buffer.length, chunkSize) : chunkSize;
      const plain = buffer.slice(0, take);
      buffer = buffer.slice(take);

      const ciphertext = new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: ivFor(baseIv, index), additionalData: aadFor(index, isFinal) },
          key,
          plain,
        ),
      );
      controller.enqueue(ciphertext);
      index += 1;

      if (isFinal) controller.close();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** Streaming encrypt with a fresh random base IV per call. */
export function streamingEncrypt(
  source: ReadableStream<Uint8Array>,
  plaintextSize: number,
  key: CryptoKey,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): ReadableStream<Uint8Array> {
  const baseIv = crypto.getRandomValues(new Uint8Array(BASE_IV_SIZE));
  return streamingEncryptWithIv(source, plaintextSize, key, baseIv, chunkSize);
}

export interface FileEncryptor {
  /** TSL1 ciphertext as a stream; feed it into multipart Parts without buffering the whole file. */
  stream: ReadableStream<Uint8Array>;
  /** Exact framed ciphertext length, for the init-multipart `size`. */
  size: number;
  /**
   * base_iv, base64. Stored as the file's `fileIv` to keep the column
   * meaningful, but informational only for TSL1: the recipient reads base_iv
   * from the ciphertext header, not from this value.
   */
  ivB64: string;
}

/** Encrypts a File into a TSL1 ciphertext stream plus the metadata the upload flow needs. */
export function encryptFileStream(
  file: File,
  key: CryptoKey,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): FileEncryptor {
  const baseIv = crypto.getRandomValues(new Uint8Array(BASE_IV_SIZE));
  return {
    stream: streamingEncryptWithIv(file.stream(), file.size, key, baseIv, chunkSize),
    size: framedSize(file.size, chunkSize),
    ivB64: bytesToBase64(baseIv),
  };
}

/**
 * Decrypts a TSL1 ciphertext stream back to plaintext. `ciphertextSize` is the
 * exact total length of the framed ciphertext (e.g. the object's Content-Length);
 * it lets every chunk's index and finality be derived positionally, so chunks
 * are independently decryptable (the basis for parallel ranged downloads).
 */
export function streamingDecrypt(
  source: ReadableStream<Uint8Array>,
  ciphertextSize: number,
  key: CryptoKey,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let sourceDone = false;
  let headerParsed = false;

  let chunkSize = 0;
  let baseIv: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let total = 0;
  let lastWireSize = 0;
  let index = 0;

  async function fill(target: number): Promise<void> {
    while (buffer.length < target && !sourceDone) {
      const { done, value } = await reader.read();
      if (done) {
        sourceDone = true;
        break;
      }
      if (value && value.length) buffer = concat(buffer, value);
    }
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerParsed) {
        await fill(HEADER_SIZE);
        if (buffer.length < HEADER_SIZE) {
          controller.error(new Error("streamingDecrypt: truncated header"));
          return;
        }
        const header = buffer.slice(0, HEADER_SIZE);
        buffer = buffer.slice(HEADER_SIZE);
        if (!isStreamingFormat(header) || header[4] !== VERSION) {
          controller.error(new Error("streamingDecrypt: bad magic or version"));
          return;
        }
        baseIv = header.slice(8, 16);
        chunkSize = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(16, true);
        if (chunkSize < 1 || chunkSize > MAX_CHUNK_SIZE) {
          controller.error(new Error("streamingDecrypt: invalid chunk size"));
          return;
        }
        const bodyLen = ciphertextSize - HEADER_SIZE;
        if (bodyLen < TAG_SIZE) {
          controller.error(new Error("streamingDecrypt: ciphertext body too small"));
          return;
        }
        const wireChunk = chunkSize + TAG_SIZE;
        total = Math.floor((bodyLen - 1) / wireChunk) + 1;
        lastWireSize = bodyLen - (total - 1) * wireChunk;
        headerParsed = true;
        // fall through to emit the first chunk in this same pull
      }

      if (index >= total) {
        await fill(1);
        if (buffer.length > 0) {
          controller.error(new Error("streamingDecrypt: trailing data after final chunk"));
          return;
        }
        controller.close();
        return;
      }

      const isFinal = index === total - 1;
      const wireSize = isFinal ? lastWireSize : chunkSize + TAG_SIZE;
      await fill(wireSize);
      if (buffer.length < wireSize) {
        controller.error(new Error("streamingDecrypt: truncated chunk (stream ended early)"));
        return;
      }
      const wire = buffer.slice(0, wireSize);
      buffer = buffer.slice(wireSize);

      let plain: ArrayBuffer;
      try {
        plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: ivFor(baseIv, index), additionalData: aadFor(index, isFinal) },
          key,
          wire,
        );
      } catch {
        controller.error(new Error("streamingDecrypt: authentication failed"));
        return;
      }
      controller.enqueue(new Uint8Array(plain));
      index += 1;
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
