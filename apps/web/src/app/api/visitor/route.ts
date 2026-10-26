import { countryName, visitorCountry } from "@/lib/geo";

// What the browser's analytics can't know on their own, for PostHog
// (src/lib/analytics-client.ts). Until a visitor consents, PostHog is
// cookieless, and cookieless mode drops the IP address before PostHog's
// GeoIP step runs, so those events arrive without a country
// (github.com/PostHog/posthog/issues/48660). The country comes from
// src/lib/geo.ts; the IP address is neither stored, logged nor returned.

export interface Visitor {
  // ISO 3166-1 alpha-2 code (FR) and English name (France), the values
  // PostHog's own GeoIP would set; null when unknown (local, private IP).
  country: { code: string; name: string } | null;
}

export const GET = (request: Request) => {
  const code = visitorCountry(request.headers);
  const visitor: Visitor = {
    country: code === undefined ? null : { code, name: countryName(code) },
  };
  // Per visitor: never cached by a browser or a shared cache.
  return Response.json(visitor, {
    headers: { "Cache-Control": "private, no-store" },
  });
};
