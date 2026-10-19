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
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

// IPv4 inside IPv6 (::ffff:a.b.c.d, NAT64 64:ff9b::a.b.c.d) is judged by its IPv4 part;
// BlockList would otherwise apply an IPv6 rule for it to every IPv4 address.
const EMBEDDED_IPV4 = /^(?:::ffff:|64:ff9b::)(?<ipv4>\d+\.\d+\.\d+\.\d+)$/iu;

const isBlocked = (address: string): boolean => {
  const embedded = EMBEDDED_IPV4.exec(address)?.groups?.["ipv4"];
  if (embedded !== undefined) {
    return isBlocked(embedded);
  }
  return blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
};

const MAX_BYTES = 50 * 1024 * 1024;
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

export const downloadImage = async (raw: string): Promise<Uint8Array> => {
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
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("Image is larger than 50 MB");
    }
    return bytes;
  }
  throw new Error("Too many redirects");
};

// Fourthwall's signed upload URLs are Google Cloud Storage; nothing else gets the bytes.
export const assertUploadUrl = async (raw: string) => {
  const url = await assertPublicHttps(raw);
  if (url.hostname !== "storage.googleapis.com") {
    throw new Error("Upload URL must be a Fourthwall storage link");
  }
  return url;
};
