import { z } from "zod";

import { CREDIT_PACK_CODE } from "./plans.ts";
import type { CreditStep } from "./plans.ts";

// wovain's catalog: the plans and the credit pack sold through Polar, what
// each paid step costs in credits, the promo codes, the redemption limit and
// how many runs a merchant has going at once. It changes per environment
// without a code change, so it is the BILLING_CATALOG env var (JSON, set from
// Pulumi config: `billingCatalog` in infra/Pulumi.<stack>.yaml) and is
// validated here. Money is in US cents and credits are whole numbers.
//
// Node runs the Polar seed (src/seed.ts) directly, so this file imports only
// zod and plans.ts, with extensions.

const credits = z.int().nonnegative();
const cents = z.int().nonnegative();

const planSchema = z.strictObject({
  // Autopilot: Nemotron picks and approves, then publishes and stages ads.
  autopilot: z.boolean(),
  // Credits autopilot may spend on the runs it starts itself (triggers),
  // per UTC day. 0 (the default) means it never starts one.
  autopilotDailyCredits: credits.default(0),
  // Credits granted at the start of every monthly cycle.
  monthlyCredits: credits,
  name: z.string().min(1),
  priceCents: cents,
  // Higher ranks win when a merchant briefly holds two subscriptions.
  rank: z.int().nonnegative(),
  // Whether a cycle's unused credits carry into the next one.
  rollover: z.boolean(),
});

const promoSchema = z.strictObject({
  // Who the code is for and how it is handed out.
  audience: z.string().min(1),
  // Credits one redemption grants. They never expire, like a pack's.
  credits: credits.positive(),
  // The only accounts that may redeem it, by email; absent means any
  // merchant. A code for one shared account (the judges' demo login) is then
  // worthless to anyone else who sees it.
  emails: z
    .array(z.email().transform((email) => email.toLowerCase()))
    .min(1)
    .optional(),
  // Off: the seed archives the product and deletes the discount, and the app
  // refuses the code.
  enabled: z.boolean(),
  // When the code stops working (ISO 8601, UTC).
  endsAt: z.iso.datetime(),
  // A stable, public name for the promo: Polar metadata, Secret Manager id,
  // ledger notes and analytics use it. Never the code itself.
  id: z.string().regex(/^[a-z0-9-]+$/u),
  // Redemptions across every merchant (Polar enforces it). Each merchant can
  // redeem a promo once.
  maxRedemptions: z.int().positive(),
  name: z.string().min(1),
  // When the code starts working (ISO 8601, UTC); now when absent.
  startsAt: z.iso.datetime().optional(),
});

export const billingCatalogSchema = z.strictObject({
  // What each metered step debits.
  creditCost: z.strictObject({
    // One finished director-made video ad (FAL_AD_VIDEO_MODELS): its cast,
    // film, two captioned cuts and review, with at most one redo. Those ads
    // are off where it's unset.
    adVideo: credits.optional(),
    // Autopilot's pick and review, or the ad copy: one Nemotron call.
    assist: credits,
    // One design: Nemotron's brief and judgment, and the art on wovain's fal
    // key while onboarding-wizard is on (the merchant's fal otherwise).
    design: credits,
    // A run's trend research: Qloo once and Tavily for each theme.
    research: credits,
    // One video ad clip on fal (FAL_VIDEO_MODEL). Video ads are off where
    // it's unset.
    video: credits.optional(),
  }),
  // A one-time top-up; its credits never expire.
  creditPack: z
    .strictObject({
      credits: credits.positive(),
      name: z.string().min(1),
      priceCents: cents,
    })
    .transform((pack) => ({ ...pack, code: CREDIT_PACK_CODE })),
  // The designs a run draws, one for each of its top ideas; each is charged.
  designsPerRun: z.int().positive(),
  plans: z
    .strictObject({ free: planSchema, label: planSchema, studio: planSchema })
    .transform(({ free, label, studio }) => ({
      free: { ...free, code: "free" as const },
      label: { ...label, code: "label" as const },
      studio: { ...studio, code: "studio" as const },
    })),
  // A promo product's list price per credit. A discount only applies to a
  // priced product, and the 100% discount takes it to $0.
  promoCentsPerCredit: cents.positive(),
  promos: z.array(promoSchema),
  // Code attempts per merchant in a sliding window, refused or not: enough
  // for a typo or two, too few to guess a code.
  redeemLimit: z.strictObject({
    attempts: z.int().positive(),
    windowSeconds: z.int().positive(),
  }),
  // Runs one merchant has going at once on the durable engine; others' runs
  // go on.
  runsPerMerchant: z.int().positive(),
});

export type BillingCatalog = z.infer<typeof billingCatalogSchema>;
export type Plan = BillingCatalog["plans"]["free"];
export type Promo = BillingCatalog["promos"][number];

export const BILLING_CATALOG_VAR = "BILLING_CATALOG";

// The catalog from its JSON. A missing or invalid value throws, naming the
// variable: there is no default to fall back to.
export const parseBillingCatalog = (raw?: string): BillingCatalog => {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      `${BILLING_CATALOG_VAR} is not set: it holds the plans, the credit pack, credit costs and promos (apps/web/.env.schema)`
    );
  }
  const parsed = billingCatalogSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${BILLING_CATALOG_VAR} is invalid: ${z.prettifyError(parsed.error)}`
    );
  }
  return parsed.data;
};

let loaded: BillingCatalog | undefined;

// This process's catalog, read from the environment once.
export const billingCatalog = (): BillingCatalog => {
  loaded ??= parseBillingCatalog(process.env[BILLING_CATALOG_VAR]);
  return loaded;
};

// What one step costs. A step the catalog doesn't price can't be charged.
export const creditCostOf = (step: CreditStep) => {
  const cost = billingCatalog().creditCost[step];
  if (cost === undefined) {
    throw new Error(`${BILLING_CATALOG_VAR} prices no ${step} step`);
  }
  return cost;
};

// What the browser may see: everything but the promos.
export const publicCatalog = ({
  creditCost,
  creditPack,
  designsPerRun,
  plans,
}: BillingCatalog) => ({ creditCost, creditPack, designsPerRun, plans });

export type PublicCatalog = ReturnType<typeof publicCatalog>;
