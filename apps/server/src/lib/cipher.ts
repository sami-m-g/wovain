import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { KeyManagementServiceClient } from "@google-cloud/kms";

// Seals a merchant's OAuth grant before it reaches Firestore. `aad` is the
// document's path: a ciphertext copied into another doc doesn't open.
export interface Cipher {
  decrypt: (ciphertext: string, aad: string) => Promise<string>;
  encrypt: (plaintext: string, aad: string) => Promise<string>;
}

const bytesOf = (value: Uint8Array | string | null | undefined) => {
  if (value === null || value === undefined) {
    throw new Error("Cloud KMS returned no data");
  }
  return typeof value === "string"
    ? Buffer.from(value, "base64")
    : Buffer.from(value);
};

// Production: Cloud KMS encrypts the grant directly (it's under 2 KB, well
// below the 64 KiB limit), so no data key is ever held by wovain.
export const kmsCipher = (
  keyName: string,
  client = new KeyManagementServiceClient()
): Cipher => ({
  decrypt: async (ciphertext, aad) => {
    const [result] = await client.decrypt({
      additionalAuthenticatedData: Buffer.from(aad),
      ciphertext: Buffer.from(ciphertext, "base64"),
      name: keyName,
    });
    return bytesOf(result.plaintext).toString("utf-8");
  },
  encrypt: async (plaintext, aad) => {
    const [result] = await client.encrypt({
      additionalAuthenticatedData: Buffer.from(aad),
      name: keyName,
      plaintext: Buffer.from(plaintext),
    });
    return bytesOf(result.ciphertext).toString("base64");
  },
});

const IV_BYTES = 12;
const TAG_BYTES = 16;

// Tests and `pnpm dev` (the emulators have no KMS): AES-256-GCM with a key
// that lives only in this process, so grants don't survive a restart.
export const localCipher = (key: Uint8Array = randomBytes(32)): Cipher => ({
  decrypt: async (ciphertext, aad) => {
    const sealed = Buffer.from(ciphertext, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      sealed.subarray(0, IV_BYTES)
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
    return await Promise.resolve(plain.toString("utf-8"));
  },
  encrypt: async (plaintext, aad) => {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([
      cipher.update(plaintext, "utf-8"),
      cipher.final(),
    ]);
    return await Promise.resolve(
      Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")
    );
  },
});
