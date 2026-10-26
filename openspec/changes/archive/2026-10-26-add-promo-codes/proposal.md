# Proposal

Issue: https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/work_items/45 (#45). Branch: `feat/billing-promos`.

## Why

Judges and early creators need more credits than Free's 15 a month, while paid plans stay off. A manual top-up (MR !128, `billing:grant`) was rejected: credits must keep coming only from Polar. Promo codes do that through Polar's own checkout and webhooks.

## What Changes

- `packages/billing/src/promos.ts`: a typed list of promos (id, credits, total redemptions, end date, on or off, audience). It holds no code values, because the repository is public.
- `pnpm polar:seed`: for each promo, a private one-time credit pack product with a meter-credit benefit and a 100%-off discount restricted to it. The discount has Polar's total and one-per-customer limits and the end date. The seed generates a random code the first time and stores it only in Polar and in Secret Manager (`polar-promo-<id>`), never printing it. An off promo's product is archived and its discount deleted.
- `billing.redeem` (oRPC): finds the code's discount in Polar, checks it, and opens a checkout with it applied. A $0 checkout is confirmed by the server, so no payment form is shown. Refusals are typed errors: `PROMO_INVALID`, `PROMO_EXPIRED`, `PROMO_USED_UP`, `PROMO_NOT_FREE`, `PROMO_ALREADY_REDEEMED` and `TOO_MANY_REQUESTS`.
- While `billing-paid-plans` is off, only codes that make the checkout $0 are accepted, checked against Polar's own total.
- The webhook grants a promo's credits as a pack grant, notes `promo <id>` in the ledger and sends `promo_redeemed` to PostHog.
- Abuse limits: one promo grant per merchant per promo (a unique index), Polar's limits, and 5 attempts per merchant per 10 minutes, counted in Postgres.
- The Billing page gets a "Redeem a code" card in en, fr and es.
- The first promo: `judges-2026`, 300 credits, 50 redemptions, until 2026-12-16. `launch-2027` is an example, off.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `billing-and-credits`: adds promo codes for credits.

## Impact

`packages/billing` (promos, redeem, seed, webhook, mirror), a migration adding `credit_grant.promo_id`, `credit_ledger.note` and `promo_attempt`, `packages/api` (`billing.redeem`), `apps/web` (Billing page and messages), the `polar:seed` CI job rules, `docs/submissions/testing.md` and `docs/pricing-proposal.md`. The Polar token needs the `discounts:read` and `discounts:write` scopes.
