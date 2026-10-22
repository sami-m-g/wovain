import { expect, test } from "vitest";

import { localCipher } from "../../src/lib/cipher.ts";

const cipher = localCipher();
const path = "users/u1/connections/fourthwall";

test("a sealed grant opens with the same document path", async () => {
  const sealed = await cipher.encrypt('{"access_token":"secret"}', path);
  expect(sealed).not.toContain("secret");
  await expect(cipher.decrypt(sealed, path)).resolves.toBe(
    '{"access_token":"secret"}'
  );
});

test("a grant copied to another user's document doesn't open", async () => {
  const sealed = await cipher.encrypt("grant", path);
  await expect(
    cipher.decrypt(sealed, "users/u2/connections/fourthwall")
  ).rejects.toThrow();
});

test("a tampered ciphertext doesn't open", async () => {
  const sealed = Buffer.from(await cipher.encrypt("grant", path), "base64");
  sealed[sealed.length - 1] = sealed.at(-1) === 0 ? 1 : 0;
  await expect(
    cipher.decrypt(sealed.toString("base64"), path)
  ).rejects.toThrow();
});

test("another key doesn't open it", async () => {
  const sealed = await cipher.encrypt("grant", path);
  await expect(localCipher().decrypt(sealed, path)).rejects.toThrow();
});
