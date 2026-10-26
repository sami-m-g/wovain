import geoip from "geoip-country";

// The visitor's country, for the consent rule (src/proxy.ts) and for
// PostHog (src/app/api/visitor/route.ts). An edge in front of the app names
// it when there is one: a Google Cloud load balancer's custom header set to
// {client_region}, Cloudflare, or Vercel. Cloud Run domain mappings send
// none, so the app looks the country up itself from the client address
// Google's frontend puts first in X-Forwarded-For, with MaxMind's GeoLite2
// country data (geoip-country, updated twice a week). Only the country
// leaves this module; the address is neither stored nor logged.

const COUNTRY_HEADERS = [
  "x-client-region",
  "cf-ipcountry",
  "x-vercel-ip-country",
];

const clientIp = (headers: Headers) =>
  headers.get("x-forwarded-for")?.split(",")[0]?.trim();

/** The visitor's ISO 3166-1 alpha-2 country code, or undefined. */
export const visitorCountry = (headers: Headers) => {
  const fromEdge = COUNTRY_HEADERS.map((name) => headers.get(name)).find(
    (value) => value !== null && value !== ""
  );
  if (fromEdge !== undefined && fromEdge !== null) {
    return fromEdge.toUpperCase();
  }
  const ip = clientIp(headers);
  return ip === undefined ? undefined : geoip.lookup(ip)?.country;
};

// English names, as PostHog's own GeoIP writes $geoip_country_name.
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

/** A country code's English name (FR: France), or the code itself. */
export const countryName = (code: string) => {
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
};
