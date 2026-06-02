import { describe, test, expect } from "bun:test";
import {
  streamingEncrypt,
  streamingDecrypt,
  encryptFileStream,
  framedSize,
  isStreamingFormat,
  HEADER_SIZE,
  DEFAULT_CHUNK_SIZE,
} from "./streaming";

// Tiny chunk size so multi-chunk boundary/tamper cases stay cheap. The format
// stores chunk_size in the header, so the decryptor adapts to whatever we use.
const CHUNK = 16;
const WIRE_CHUNK = CHUNK + 16; // ciphertext + GCM tag

function genKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

function bytesToStream(bytes: Uint8Array, piece = 7): ReadableStream<Uint8Array> {
  let off = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (off >= bytes.length) {
        c.close();
        return;
      }
      const end = Math.min(off + piece, bytes.length);
      c.enqueue(bytes.slice(off, end));
      off = end;
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let len = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      len += value.length;
    }
  }
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) {
    crypto.getRandomValues(b.subarray(i, Math.min(i + 65536, n)));
  }
  return b;
}

function patterned(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
  return b;
}

function encryptBytes(plain: Uint8Array, key: CryptoKey, chunkSize = CHUNK): Promise<Uint8Array> {
  return collect(streamingEncrypt(bytesToStream(plain), plain.length, key, chunkSize));
}

// `declaredSize` defaults to the actual byte length but can be overridden to
// model a server that serves fewer bytes than the client believes exist.
function decryptBytes(cipher: Uint8Array, key: CryptoKey, declaredSize = cipher.length): Promise<Uint8Array> {
  return collect(streamingDecrypt(bytesToStream(cipher), declaredSize, key));
}

describe("TSL1 round-trip", () => {
  const sizes = [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 5 * CHUNK, 5 * CHUNK + 3, 17 * CHUNK + 9];

  for (const size of sizes) {
    test(`round-trips ${size} bytes`, async () => {
      const key = await genKey();
      const plain = patterned(size);
      const cipher = await encryptBytes(plain, key);
      // closed-form size must match the bytes actually produced
      expect(cipher.length).toBe(framedSize(size, CHUNK));
      const out = await decryptBytes(cipher, key);
      expect(out.length).toBe(size);
      expect([...out]).toEqual([...plain]);
    });
  }

  test("round-trips a 1 MiB file at the real default chunk size", async () => {
    const key = await genKey();
    const size = DEFAULT_CHUNK_SIZE + 12345;
    const plain = randomBytes(size);
    const cipher = await collect(streamingEncrypt(bytesToStream(plain, 64 * 1024), size, key, DEFAULT_CHUNK_SIZE));
    expect(cipher.length).toBe(framedSize(size, DEFAULT_CHUNK_SIZE));
    const out = await collect(streamingDecrypt(bytesToStream(cipher, 64 * 1024), cipher.length, key));
    expect(out.length).toBe(size);
    expect(Buffer.from(out).equals(Buffer.from(plain))).toBe(true);
  });

  test("isStreamingFormat detects the magic and rejects legacy/random bytes", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(40), key);
    expect(isStreamingFormat(cipher)).toBe(true);
    expect(isStreamingFormat(randomBytes(64))).toBe(false);
    expect(isStreamingFormat(new Uint8Array(2))).toBe(false);
  });
});

describe("TSL1 integrity", () => {
  test("wrong key fails on the first chunk", async () => {
    const k1 = await genKey();
    const k2 = await genKey();
    const cipher = await encryptBytes(patterned(5 * CHUNK), k1);
    await expect(decryptBytes(cipher, k2)).rejects.toThrow();
  });

  test("a flipped ciphertext byte is rejected", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(5 * CHUNK), key);
    const tampered = cipher.slice();
    tampered[HEADER_SIZE + 3] ^= 0x01; // inside chunk 0's ciphertext
    await expect(decryptBytes(tampered, key)).rejects.toThrow();
  });

  test("reordering two chunks is rejected", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(5 * CHUNK), key); // 5 full wire chunks
    const t = cipher.slice();
    const c0 = cipher.slice(HEADER_SIZE, HEADER_SIZE + WIRE_CHUNK);
    const c1 = cipher.slice(HEADER_SIZE + WIRE_CHUNK, HEADER_SIZE + 2 * WIRE_CHUNK);
    t.set(c1, HEADER_SIZE);
    t.set(c0, HEADER_SIZE + WIRE_CHUNK);
    await expect(decryptBytes(t, key)).rejects.toThrow();
  });

  test("duplicating a chunk into another slot is rejected", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(5 * CHUNK), key);
    const t = cipher.slice();
    const c0 = cipher.slice(HEADER_SIZE, HEADER_SIZE + WIRE_CHUNK);
    t.set(c0, HEADER_SIZE + WIRE_CHUNK); // chunk 1 slot now holds chunk 0 bytes
    await expect(decryptBytes(t, key)).rejects.toThrow();
  });

  test("truncation with the original declared size is caught (stream ends early)", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(5 * CHUNK), key);
    const dropped = cipher.slice(0, cipher.length - WIRE_CHUNK); // drop last chunk
    await expect(decryptBytes(dropped, key, cipher.length)).rejects.toThrow();
  });

  test("truncation with a matching (forged-low) size is caught by the is_final binding", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(5 * CHUNK), key);
    const dropped = cipher.slice(0, cipher.length - WIRE_CHUNK);
    // declaredSize matches the truncated bytes, so the new "last" chunk was
    // actually encrypted with is_final = 0 -> AAD mismatch -> auth failure.
    await expect(decryptBytes(dropped, key, dropped.length)).rejects.toThrow();
  });

  test("trailing bytes after the final chunk are rejected", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(3 * CHUNK), key);
    const extended = new Uint8Array(cipher.length + 8);
    extended.set(cipher, 0);
    await expect(decryptBytes(extended, key)).rejects.toThrow();
  });
});

describe("TSL1 header validation", () => {
  test("a corrupted magic is rejected at header read", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(2 * CHUNK), key);
    const t = cipher.slice();
    t[0] ^= 0xff;
    await expect(decryptBytes(t, key)).rejects.toThrow(/magic or version/);
  });

  test("an unknown version is rejected at header read", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(2 * CHUNK), key);
    const t = cipher.slice();
    t[4] = 0x02;
    await expect(decryptBytes(t, key)).rejects.toThrow(/magic or version/);
  });

  test("a truncated header is rejected", async () => {
    const key = await genKey();
    const cipher = await encryptBytes(patterned(2 * CHUNK), key);
    await expect(decryptBytes(cipher.slice(0, HEADER_SIZE - 1), key, cipher.length)).rejects.toThrow();
  });
});

describe("encryptFileStream (upload integration)", () => {
  test("round-trips a File, with an exact size and an 8-byte base IV", async () => {
    const key = await genKey();
    // ~3 MiB at the real default chunk size, plus a partial final chunk.
    const data = patterned(3 * DEFAULT_CHUNK_SIZE + 777);
    const file = new File([data], "photo.raw", { type: "application/octet-stream" });

    const enc = encryptFileStream(file, key);
    expect(enc.size).toBe(framedSize(data.length, DEFAULT_CHUNK_SIZE));
    expect(atob(enc.ivB64).length).toBe(8); // base_iv

    const cipher = await collect(enc.stream);
    expect(cipher.length).toBe(enc.size); // matches what init-multipart was told
    expect(isStreamingFormat(cipher)).toBe(true);

    // Decrypt the way a recipient does: ignore the stored IV, read base_iv from
    // the header. Feed it back in irregular pieces to mimic multipart Part
    // boundaries that don't align to chunks.
    const out = await collect(streamingDecrypt(bytesToStream(cipher, 333_333), cipher.length, key));
    expect(out.length).toBe(data.length);
    expect(Buffer.from(out).equals(Buffer.from(data))).toBe(true);
  });
});
