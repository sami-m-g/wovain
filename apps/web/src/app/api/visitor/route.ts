import { ENV } from "@/env.server";
import { countryName, visitorCountry } from "@/lib/geo";
import { auth } from "@/services";

// The team's emails, lowercased; analytics only, never an entitlement.
const TEAM = new Set(
  (ENV.WOVAIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== "")
);

// What the browser's analytics can't know on their own, for PostHog
// (src/lib/analytics-client.ts). Until a visitor consents, PostHog is
// cookieless, and cookieless mode drops the IP address before PostHog's
// GeoIP step runs, so those events arrive without a country
// (github.com/PostHog/posthog/issues/48660). The country comes from
// src/lib/geo.ts; the IP address is neither stored, logged nor returned.
// `internal` marks a signed-in team member (WOVAIN_ALLOWED_EMAILS) so
// analytics can leave them out; the email itself never leaves the server.

export interface Visitor {
  // ISO 3166-1 alpha-2 code (FR) and English name (France), the values
  // PostHog's own GeoIP would set; null when unknown (local, private IP).
  country: { code: string; name: string } | null;
  internal: boolean;
}

// Without a readable session (signed out, database unreachable), a visitor
// counts as external.
const isInternal = async (headers: Headers) => {
  try {
    const session = await auth.api.getSession({ headers });
    return session !== null && TEAM.has(session.user.email.toLowerCase());
  } catch {
    return false;
  }
};

export const GET = async (request: Request) => {
  const code = visitorCountry(request.headers);
  const visitor: Visitor = {
    country: code === undefined ? null : { code, name: countryName(code) },
    internal: await isInternal(request.headers),
  };
  // Per visitor: never cached by a browser or a shared cache.
  return Response.json(visitor, {
    headers: { "Cache-Control": "private, no-store" },
  });
};
