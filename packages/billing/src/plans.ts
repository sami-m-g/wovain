// What wovain sells through Polar, by code, and how the app and the Polar
// seed (src/seed.ts) find it. The plans' prices and credits, the pack and
// the credit costs are per-environment config (src/catalog.ts). Node runs the
// seed directly, so this file imports nothing.

// The designs a run draws, one for each of its top ideas; each is charged.
export const DESIGNS_PER_RUN = 3;

// The metered steps (their costs are BILLING_CATALOG's creditCost).
export type CreditStep = "assist" | "design" | "research";

export const PLAN_CODES = ["free", "studio", "label"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

// The one-time credit pack's product code.
export const CREDIT_PACK_CODE = "pack";

// What a checkout can sell: a paid plan or the pack.
export const OFFERS = ["studio", "label", "pack"] as const;
export type Offer = (typeof OFFERS)[number];

// How the seed tags what it creates in Polar, and how the app finds it again:
// products and benefits carry `wovain` metadata, so nothing depends on IDs
// copied from the dashboard.
export const POLAR_METADATA_KEY = "wovain";

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
