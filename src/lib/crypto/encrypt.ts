import { generateIv, ivToBase64 } from './key';

export interface EncryptedString {
  ciphertext: string; // base64 AES-GCM output (no url-safe; no padding stripped)
  iv: string; // base64 12-byte IV (no padding)
}

export interface EncryptedFilename {
  encryptedName: string;
  iv: string;
}

const STRING_PAD_MULTIPLE = 32;

/** Pads to a 32-byte boundary to hide length metadata. */
export async function encryptString(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedString> {
  const iv = generateIv();
  const encoder = new TextEncoder();
  const raw = encoder.encode(plaintext);

  const paddedLength = Math.ceil(Math.max(raw.length, 1) / STRING_PAD_MULTIPLE) * STRING_PAD_MULTIPLE;
  const data = new Uint8Array(paddedLength);
  data.set(raw);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    data
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: ivToBase64(iv)
  };
}

export async function encryptFilename(
  filename: string,
  key: CryptoKey
): Promise<EncryptedFilename> {
  const { ciphertext, iv } = await encryptString(filename, key);
  return { encryptedName: ciphertext, iv };
}
