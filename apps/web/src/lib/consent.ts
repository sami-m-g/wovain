// Analytics consent by country. PostHog runs in cookieless "on_reject" mode
// (instrumentation-client.ts): until a visitor accepts, it stores nothing in
// the browser and records no replays. Where the law asks for an opt-in,
// visitors see the banner (components/consent-banner.tsx); elsewhere
// consent is implied and the footer's "Cookie settings" still lets them say
// no. PostHog keeps the choice itself (get_explicit_consent_status).

// ISO 3166-1 alpha-2 codes where analytics cookies and session replay need an
// opt-in: the EU (with its outermost regions and Åland) and the rest of the
// EEA under the GDPR and ePrivacy Directive, the UK, its Crown Dependencies
// and Gibraltar under UK GDPR and PECR, Switzerland (revFADP), Brazil (LGPD)
// and Canada (PIPEDA, and Quebec's Law 25 for tracking technologies). The US
// stays implied for now; whether it asks first (California's CIPA and replay)
// is still to be decided.
const OPT_IN_COUNTRIES = new Set([
  // EU member states
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  // EU outermost regions and Åland, which have their own codes
  "AX",
  "GF",
  "GP",
  "MF",
  "MQ",
  "RE",
  "YT",
  // EEA
  "IS",
  "LI",
  "NO",
  // UK, Crown Dependencies, Gibraltar
  "GB",
  "GG",
  "GI",
  "IM",
  "JE",
  // Switzerland, Brazil, Canada
  "CH",
  "BR",
  "CA",
]);

// The proxy (src/proxy.ts) writes the visitor's rule here when it knows
// their country (lib/geo.ts); the browser reads it before PostHog
// starts. It holds no identifier, only which rule applies.
export const CONSENT_REGION_COOKIE = "consent-region";
const IMPLIED = "implied";
const OPT_IN = "opt-in";

// Codes an edge sends when it doesn't know the country (Cloudflare's XX for
// unknown and T1 for Tor).
const COUNTRY_CODE = /^[A-Z]{2}$/u;
const UNKNOWN_COUNTRIES = new Set(["XX", "T1"]);

/** The consent rule for a country code, or undefined when it's unknown. */
export const consentRegionFor = (country: string | null | undefined) => {
  const code = country?.trim().toUpperCase() ?? "";
  if (!COUNTRY_CODE.test(code) || UNKNOWN_COUNTRIES.has(code)) {
    return;
  }
  return OPT_IN_COUNTRIES.has(code) ? OPT_IN : IMPLIED;
};

/**
 * Whether this visitor must opt in before PostHog stores anything. Only a
 * known country outside the opt-in list skips the banner: an unknown country
 * asks, the safe default.
 */
export const consentRequired = () => {
  const prefix = `${CONSENT_REGION_COOKIE}=`;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  return cookie?.slice(prefix.length) !== IMPLIED;
};
