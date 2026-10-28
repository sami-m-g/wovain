// wovain's promo codes for credits, defined in BILLING_CATALOG's `promos`
// (src/catalog.ts) and applied to Polar by `pnpm polar:seed` (src/seed.ts),
// like the plans. Each promo is a one-time credit pack product in Polar with
// a 100%-off discount restricted to it, so redeeming one is a normal $0
// checkout whose benefit grant brings the credits through the webhook
// (src/webhooks.ts).
//
// The repository is public, so no code value lives in it or in the config:
// the seed generates a random code for each promo the first time, keeps it
// only in Polar and Secret Manager (polar-promo-<id>), and never prints it.
// Read a code with `gcloud secrets versions access latest
// --secret=polar-promo-<id>` or in the Polar dashboard (Products >
// Discounts). Node runs the seed directly, so imports carry extensions.

import { billingCatalog } from "./catalog.ts";
import type { Promo } from "./catalog.ts";

export type { Promo } from "./catalog.ts";

// What the seed tags a promo's product, benefit and discount with
// (`wovain` metadata), and what the webhook reads back.
const TAG_PREFIX = "promo:";

export const promoTag = (id: string) => `${TAG_PREFIX}${id}`;

export const promoOfTag = (tag: unknown): Promo | undefined => {
  if (typeof tag !== "string" || !tag.startsWith(TAG_PREFIX)) {
    return;
  }
  const id = tag.slice(TAG_PREFIX.length);
  return billingCatalog().promos.find((promo) => promo.id === id);
};

// The promo product's list price: its credits at promoCentsPerCredit. A
// discount only applies to a priced product, and the 100% discount takes it
// to $0.
export const promoPriceCents = (promo: Pick<Promo, "credits">) =>
  promo.credits * billingCatalog().promoCentsPerCredit;

// Where the seed keeps a promo's code: a Secret Manager secret in CI, or a
// line in a gitignored env file locally.
export const promoSecretId = (id: string) => `polar-promo-${id}`;
