import { createHmac, timingSafeEqual } from "node:crypto";

// The one-click unsubscribe link (RFC 8058, required of bulk senders by Gmail
// and Yahoo). The token names an address and signs it with a server secret, so
// the endpoint needs no session and nobody can unsubscribe someone else.

const sign = (secret: string, email: string) =>
  createHmac("sha256", secret).update(email).digest("base64url");

export const unsubscribeToken = (secret: string, email: string) =>
  `${Buffer.from(email).toString("base64url")}.${sign(secret, email)}`;

// The address a token was issued for; undefined when it is forged or garbled.
export const verifyUnsubscribeToken = (
  secret: string,
  token: string
): string | undefined => {
  const [encoded, signature, ...rest] = token.split(".");
  if (encoded === undefined || signature === undefined || rest.length > 0) {
    return undefined;
  }
  const email = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(sign(secret, email));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected)
    ? email
    : undefined;
};
