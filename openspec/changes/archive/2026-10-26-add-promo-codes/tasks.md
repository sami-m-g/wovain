# Tasks

## 1. Promos in Polar

- [x] 1.1 Typed promo definitions without code values (`packages/billing/src/promos.ts`)
- [x] 1.2 `pnpm polar:seed` creates or updates each promo's product, benefit and 100%-off discount, idempotently
- [x] 1.3 Random codes stored only in Secret Manager (`polar-promo-<id>`) or a gitignored file, never printed
- [x] 1.4 `polar:seed` CI job runs when `promos.ts` changes

## 2. Redeeming

- [x] 2.1 `billing.redeem` with typed oRPC errors
- [x] 2.2 Free-only while `billing-paid-plans` is off, checked against Polar's total
- [x] 2.3 A $0 checkout confirmed by the server, with Polar's page as the fallback
- [x] 2.4 Rate limit and one redemption per merchant per promo
- [x] 2.5 "Redeem a code" on the Billing page, in en, fr and es

## 3. Credits

- [x] 3.1 Promo grants through the webhook only, idempotent, with a ledger note
- [x] 3.2 PostHog `promo_redeemed` with the promo id, credits and surface

## 4. Tests and docs

- [x] 4.1 Vitest on PGlite for the redeem checks, the rate limit and the per-merchant limit
- [x] 4.2 Signed webhook simulation for promo grants
- [x] 4.3 `docs/submissions/testing.md`, `docs/pricing-proposal.md`
