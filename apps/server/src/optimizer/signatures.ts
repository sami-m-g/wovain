import { createHmac, timingSafeEqual } from "node:crypto";

// Webhook signatures, always over the raw body as received: a body parsed
// and serialized again can differ by a byte and must fail.

const same = (expected: Buffer, given: Buffer) =>
  expected.length === given.length && timingSafeEqual(expected, given);

const hmac = (secret: string, rawBody: string) =>
  createHmac("sha256", secret).update(rawBody, "utf-8").digest();

// Fourthwall: X-Fourthwall-Hmac-SHA256 (or -Apps-SHA256 for a Platform App)
// is the base64 HMAC-SHA256 of the body with the webhook's secret.
export const fourthwallSigned = (
  rawBody: string,
  header?: string,
  secret?: string
) =>
  header !== undefined &&
  secret !== undefined &&
  secret !== "" &&
  same(hmac(secret, rawBody), Buffer.from(header, "base64"));

// Meta: X-Hub-Signature-256 is `sha256=<hex>` with the app secret.
export const metaSigned = (
  rawBody: string,
  header?: string,
  appSecret?: string
) => {
  const hex = /^sha256=(?<hex>[\da-f]{64})$/u.exec(header ?? "")?.groups?.[
    "hex"
  ];
  return (
    hex !== undefined &&
    appSecret !== undefined &&
    appSecret !== "" &&
    same(hmac(appSecret, rawBody), Buffer.from(hex, "hex"))
  );
};

// Meta's GET verification: the token it echoes must match ours.
export const tokenMatches = (given: string | undefined, ours?: string) =>
  given !== undefined &&
  ours !== undefined &&
  ours !== "" &&
  same(Buffer.from(ours), Buffer.from(given));
