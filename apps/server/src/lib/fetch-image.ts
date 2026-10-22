import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Outbound requests carry the merchant's artwork, so they only go to public
// HTTPS hosts. Every hostname is resolved and every address checked, and each
// redirect hop is checked again, so a public URL can't bounce to a local service.
// Residual risk: DNS could change between this check and the connection.

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
// IPv4-compatible (::/96, which also covers :: and ::1), NAT64, Teredo and
// 6to4 can all reach IPv4 hosts, so they are blocked outright.
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["2001::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

// BlockList judges IPv4-mapped IPv6 (::ffff:7f00:1) by the IPv4 rules. A zone
// suffix (fe80::1%en0) has to go first or the address isn't matched.
const isBlocked = (address: string) => {
  const bare = address.split("%")[0] ?? "";
  return blocked.check(bare, isIP(bare) === 6 ? "ipv6" : "ipv4");
};

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 50 * MB;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 60_000;

const systemResolver = async (host: string) => {
  const entries = await lookup(host, { all: true });
  return entries.map((entry) => entry.address);
};

let resolveAll = systemResolver;

// Tests swap in a resolver so they don't depend on live DNS.
export const setResolver = (
  resolver: (host: string) => Promise<string[]> = systemResolver
) => {
  resolveAll = resolver;
};

const assertPublicHttps = async (raw: string | URL) => {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("Only https URLs are allowed");
  }
  const host = url.hostname.replaceAll(/^\[|\]$/gu, "");
  const addresses = isIP(host) === 0 ? await resolveAll(host) : [host];
  if (addresses.length === 0 || addresses.some(isBlocked)) {
    throw new Error("Only public addresses are allowed");
  }
  return url;
};

// Exposed for tests: the address rules without a network lookup.
export const isPublicAddress = (address: string) => !isBlocked(address);

// Stops reading once the body passes the cap instead of buffering it first.
const readCapped = async (
  response: Response,
  maxBytes: number
): Promise<Uint8Array> => {
  const tooLarge = `File is larger than ${maxBytes / MB} MB`;
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    throw new Error(tooLarge);
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- a stream is read in order
    const { done, value } = await reader.read();
    if (done) {
      return new Uint8Array(Buffer.concat(chunks));
    }
    total += value.byteLength;
    if (total > maxBytes) {
      // oxlint-disable-next-line no-await-in-loop -- the loop ends here
      await reader.cancel();
      throw new Error(tooLarge);
    }
    chunks.push(value);
  }
};

export const downloadImage = async (
  raw: string,
  maxBytes = MAX_IMAGE_BYTES
): Promise<Uint8Array> => {
  let url = await assertPublicHttps(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each hop depends on the last
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location !== null) {
      // oxlint-disable-next-line no-await-in-loop -- validate before following
      url = await assertPublicHttps(new URL(location, url));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Download failed with ${response.status}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- the loop ends here
    return await readCapped(response, maxBytes);
  }
  throw new Error("Too many redirects");
};

// Only Fourthwall's upload bucket gets the bytes (seen in its signed upload
// links), so a prompt can't send the merchant's artwork anywhere else.
const FOURTHWALL_UPLOAD_PREFIX = "/popshopprod-orders-tmp/";

const assertUploadUrl = async (raw: string) => {
  const url = await assertPublicHttps(raw);
  if (
    url.hostname !== "storage.googleapis.com" ||
    !url.pathname.startsWith(FOURTHWALL_UPLOAD_PREFIX)
  ) {
    throw new Error("Upload URL must be a Fourthwall storage link");
  }
  return url;
};

// PUTs the bytes to a signed Fourthwall upload link.
export const uploadArtwork = async (
  raw: string,
  body: Uint8Array<ArrayBuffer>,
  contentType: string
) => {
  const response = await fetch(await assertUploadUrl(raw), {
    body,
    // Fourthwall signs the upload with its content type and a size
    // limit; both headers must match or Google storage answers 403.
    headers: {
      "content-type": contentType,
      "x-goog-content-length-range": `0,${body.byteLength}`,
    },
    method: "PUT",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Fourthwall storage answered ${response.status}`);
  }
};
