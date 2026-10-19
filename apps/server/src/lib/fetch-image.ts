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

// IPv6 is judged on its 16 bytes, not its text: URL parsing rewrites
// [::ffff:127.0.0.1] as ::ffff:7f00:1, so text patterns miss it.
const hextets = (text: string) =>
  text === "" ? [] : text.split(":").map((part) => Number.parseInt(part, 16));

const expandIPv6 = (address: string): number[] => {
  let text = address.toLowerCase().split("%")[0] ?? "";
  const dotted = /(?<v4>\d+\.\d+\.\d+\.\d+)$/u.exec(text)?.groups?.["v4"];
  if (dotted !== undefined) {
    const [a = 0, b = 0, c = 0, d = 0] = dotted.split(".").map(Number);
    text = `${text.slice(0, -dotted.length)}${(a * 256 + b).toString(16)}:${(c * 256 + d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const left = hextets(head);
  const right = tail === undefined ? [] : hextets(tail);
  const fill = Array.from({ length: 8 - left.length - right.length }, () => 0);
  return [...left, ...fill, ...right];
};

const isBlockedIPv4 = (address: string) => blocked.check(address, "ipv4");

const isBlockedIPv6 = (address: string): boolean => {
  const h = expandIPv6(address);
  const zeros = (from: number, to: number) =>
    h.slice(from, to).every((part) => part === 0);
  // IPv4-mapped (::ffff:0:0/96): judge the IPv4 address it carries.
  if (zeros(0, 5) && h[5] === 0xff_ff) {
    const [hi = 0, lo = 0] = h.slice(6);
    return isBlockedIPv4(
      [Math.floor(hi / 256), hi % 256, Math.floor(lo / 256), lo % 256].join(".")
    );
  }
  // IPv4-compatible (::/96), NAT64 (64:ff9b::/96, 64:ff9b:1::/48), 6to4
  // (2002::/16) and Teredo (2001::/32) can all reach IPv4 hosts: block them.
  const tunnels =
    zeros(0, 6) ||
    (h[0] === 0x64 && h[1] === 0xff_9b) ||
    h[0] === 0x20_02 ||
    (h[0] === 0x20_01 && h[1] === 0);
  return tunnels || blocked.check(address, "ipv6");
};

const isBlocked = (address: string) =>
  isIP(address) === 6 ? isBlockedIPv6(address) : isBlockedIPv4(address);

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

// Stops reading once the body passes the cap instead of buffering it first.
const readCapped = async (response: Response): Promise<Uint8Array> => {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw new Error("Image is larger than 50 MB");
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
    if (total > MAX_BYTES) {
      // oxlint-disable-next-line no-await-in-loop -- the loop ends here
      await reader.cancel();
      throw new Error("Image is larger than 50 MB");
    }
    chunks.push(value);
  }
};

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
    return await readCapped(response);
  }
  throw new Error("Too many redirects");
};

// Only Fourthwall's upload bucket gets the bytes (seen in its signed upload
// links), so a prompt can't send the merchant's artwork anywhere else.
const FOURTHWALL_UPLOAD_PREFIX = "/popshopprod-orders-tmp/";

export const assertUploadUrl = async (raw: string) => {
  const url = await assertPublicHttps(raw);
  if (
    url.hostname !== "storage.googleapis.com" ||
    !url.pathname.startsWith(FOURTHWALL_UPLOAD_PREFIX)
  ) {
    throw new Error("Upload URL must be a Fourthwall storage link");
  }
  return url;
};
