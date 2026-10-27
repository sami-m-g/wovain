// wovain's catalog: the plans and the credit pack sold through Polar, and what
// each paid step costs in credits. This file is the one source for both the
// app (entitlements, the pricing page) and the Polar seed (src/seed.ts), so it
// imports nothing. Money is in US cents and credits are whole numbers.
// The numbers are a proposal (docs/pricing-proposal.md) until they are locked.

// The designs a run draws, one for each of its top ideas; each is charged.
export const DESIGNS_PER_RUN = 3;

// What each metered step debits. A manual drop (research, three designs, ad
// copy for one approved design) is 10 credits; an autopilot drop adds its
// pick and a review per design, 14 credits.
export const CREDIT_COST = {
  // Autopilot's pick and review, or the ad copy: one Nemotron call.
  assist: 1,
  // One design: Nemotron's brief and judgment (the art runs on the merchant's
  // fal account).
  design: 2,
  // A run's trend research: Qloo once and Tavily for each theme.
  research: 3,
} as const;

export type CreditStep = keyof typeof CREDIT_COST;

export const PLAN_CODES = ["free", "studio", "label"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface Plan {
  // Autopilot: Nemotron picks and approves, then publishes and stages ads.
  autopilot: boolean;
  code: PlanCode;
  // Credits granted at the start of every monthly cycle.
  monthlyCredits: number;
  name: string;
  priceCents: number;
  // Higher ranks win when a merchant briefly holds two subscriptions.
  rank: number;
  // Whether a cycle's unused credits carry into the next one.
  rollover: boolean;
}

export const PLANS: Record<PlanCode, Plan> = {
  free: {
    autopilot: false,
    code: "free",
    monthlyCredits: 15,
    name: "Free",
    priceCents: 0,
    rank: 0,
    rollover: false,
  },
  label: {
    autopilot: true,
    code: "label",
    monthlyCredits: 1000,
    name: "Label",
    priceCents: 7900,
    rank: 2,
    rollover: true,
  },
  studio: {
    autopilot: true,
    code: "studio",
    monthlyCredits: 300,
    name: "Studio",
    priceCents: 2900,
    rank: 1,
    rollover: false,
  },
};

// A one-time top-up; its credits never expire.
export const CREDIT_PACK = {
  code: "pack",
  credits: 100,
  name: "Credit pack",
  priceCents: 1000,
} as const;

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
