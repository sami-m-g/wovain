// What wovain sells through Polar, by code, and how the app and the Polar
// seed (src/seed.ts) find it. The plans' prices and credits, the pack and
// the credit costs are per-environment config (src/catalog.ts). Node runs the
// seed directly, so this file imports nothing.

// The metered steps (their costs are BILLING_CATALOG's creditCost).
export type CreditStep = "adVideo" | "assist" | "design" | "research" | "video";

export const PLAN_CODES = ["free", "studio", "label"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

// The one-time credit pack's product code.
export const CREDIT_PACK_CODE = "pack";

// What a checkout can sell: a paid plan or the pack.
export const OFFERS = ["studio", "label", "pack"] as const;
export type Offer = (typeof OFFERS)[number];

// How the seed tags what it creates in Polar, and how the app finds it again:
// products and benefits carry `wovain` metadata, so nothing depends on IDs
// copied from the dashboard. An environment that shares a Polar organization
// with another one sets its own key (POLAR_METADATA_KEY, e.g. `wovain:next`),
// so the seed and the app never find, change or archive the other's objects.
const DEFAULT_METADATA_KEY = "wovain";
const metadataKey = process.env["POLAR_METADATA_KEY"];
export const POLAR_METADATA_KEY =
  metadataKey === undefined || metadataKey === ""
    ? DEFAULT_METADATA_KEY
    : metadataKey;

const NOT_SECRET_ID_CHARACTERS = /[^\w-]+/gu;

// A Secret Manager ID the seed writes (a promo's code, the webhook's signing
// secret), per environment, so a seed never adds a version to another
// environment's secret. Production's plain `wovain` key keeps the ID as it
// is; another key adds its environment: `wovain:next` makes `<id>-next`.
export const environmentSecretId = (
  id: string,
  key: string = POLAR_METADATA_KEY
) => {
  if (key === DEFAULT_METADATA_KEY) {
    return id;
  }
  const prefix = `${DEFAULT_METADATA_KEY}:`;
  const environment = (
    key.startsWith(prefix) ? key.slice(prefix.length) : key
  ).replaceAll(NOT_SECRET_ID_CHARACTERS, "-");
  if (environment === "" || environment === "-") {
    throw new Error(
      `POLAR_METADATA_KEY ${key} names no environment for secret IDs`
    );
  }
  return `${id}-${environment}`;
};

// Polar's usage meter: the sum of `credits` over `credits_used` events, one per
// settled step (src/polar.ts ingests them).
export const CREDIT_METER = {
  event: "credits_used",
  name: "wovain credits",
  property: "credits",
} as const;

// The Polar events wovain's webhook endpoint subscribes to (src/webhooks.ts
// handles them; src/seed.ts registers them).
export const POLAR_WEBHOOK_EVENTS = [
  "benefit_grant.created",
  "benefit_grant.cycled",
  "benefit_grant.updated",
  "benefit_grant.revoked",
  "customer.created",
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.past_due",
  "subscription.revoked",
] as const;

export const isPlanCode = (value: unknown): value is PlanCode =>
  typeof value === "string" &&
  (PLAN_CODES as readonly string[]).includes(value);
