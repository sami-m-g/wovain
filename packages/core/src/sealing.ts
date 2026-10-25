import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Seals a merchant's provider tokens before they reach the database, with
// AES-256-GCM from Node's crypto. `context` (the owner and provider) is bound
// as additional data, so a ciphertext copied to another row doesn't open.

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface Sealer {
  open: (sealed: string, context: string) => string;
  seal: (plaintext: string, context: string) => string;
}

// `key` is 32 random bytes, base64 encoded (openssl rand -base64 32).
export const createSealer = (key: string): Sealer => {
  const secret = Buffer.from(key, "base64");
  if (secret.byteLength !== KEY_BYTES) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return {
    open: (sealed, context) => {
      const bytes = Buffer.from(sealed, "base64");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        secret,
        bytes.subarray(0, IV_BYTES)
      );
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([
        decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString("utf-8");
    },
    seal: (plaintext, context) => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", secret, iv);
      cipher.setAAD(Buffer.from(context));
      const body = Buffer.concat([
        cipher.update(plaintext, "utf-8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
    },
  };
};
