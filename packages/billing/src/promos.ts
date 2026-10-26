// wovain's promo codes for credits, defined in code and applied to Polar by
// `pnpm polar:seed` (src/seed.ts), like the plans. Each promo is a one-time
// credit pack product in Polar with a 100%-off discount restricted to it, so
// redeeming one is a normal $0 checkout whose benefit grant brings the
// credits through the webhook (src/webhooks.ts).
//
// The repository is public, so this file holds no code values: the seed
// generates a random code for each promo the first time, keeps it only in
// Polar and Secret Manager (polar-promo-<id>), and never prints it. Read a
// code with `gcloud secrets versions access latest --secret=polar-promo-<id>`
// or in the Polar dashboard (Products > Discounts). Like plans.ts, this file
// imports nothing, because Node runs the seed directly.

export interface Promo {
  // Who the code is for and how it is handed out.
  audience: string;
  // Credits one redemption grants. They never expire, like a pack's.
  credits: number;
  // Off: the seed archives the product and deletes the discount, and the app
  // refuses the code.
  enabled: boolean;
  // When the code stops working (ISO 8601, UTC).
  endsAt: string;
  // A stable, public name for the promo: Polar metadata, Secret Manager id,
  // ledger notes and analytics use it. Never the code itself.
  id: string;
  // Redemptions across every merchant (Polar enforces it). Each merchant can
  // redeem a promo once.
  maxRedemptions: number;
  name: string;
  // When the code starts working (ISO 8601, UTC); now when absent.
  startsAt?: string | undefined;
}

export const PROMOS = [
  {
    audience:
      "Hackathon judges: the code is shared only in Devpost's private testing instructions.",
    credits: 300,
    enabled: true,
    endsAt: "2026-12-16T23:59:59Z",
    id: "judges-2026",
    maxRedemptions: 50,
    name: "Judges 2026",
  },
  {
    audience:
      "Launch: a public code for the first creators, once paid plans are on.",
    credits: 50,
    enabled: false,
    endsAt: "2027-03-31T23:59:59Z",
    id: "launch-2027",
    maxRedemptions: 500,
    name: "Launch 2027",
    startsAt: "2027-01-15T00:00:00Z",
  },
] as const satisfies readonly Promo[];

export type PromoId = (typeof PROMOS)[number]["id"];

// What the seed tags a promo's product, benefit and discount with
// (`wovain` metadata), and what the webhook reads back.
const TAG_PREFIX = "promo:";

export const promoTag = (id: string) => `${TAG_PREFIX}${id}`;

export const promoOfTag = (tag: unknown): Promo | undefined => {
  if (typeof tag !== "string" || !tag.startsWith(TAG_PREFIX)) {
    return;
  }
  const id = tag.slice(TAG_PREFIX.length);
  return PROMOS.find((promo) => promo.id === id);
};

// The promo product's list price: its credits at the credit pack's rate
// ($10 for 100). A discount only applies to a priced product, and the 100%
// discount takes it to $0.
export const PROMO_CENTS_PER_CREDIT = 10;

export const promoPriceCents = (promo: Pick<Promo, "credits">) =>
  promo.credits * PROMO_CENTS_PER_CREDIT;

// Where the seed keeps a promo's code: a Secret Manager secret in CI, or a
// line in a gitignored env file locally.
export const promoSecretId = (id: string) => `polar-promo-${id}`;
