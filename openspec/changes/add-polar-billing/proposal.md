# Proposal

MR: !116 (`feat/billing-polar`, draft). Status: in review; prices are a proposal (`docs/pricing-proposal.md`).

## Why

wovain pays for Nebius, Tavily and Qloo on every drop, and access is an email allowlist with racy metering (`flow/spend.ts`). A real product needs plans, a free allowance and an atomic ledger, with a merchant of record for tax and invoices.

## What Changes

- `packages/billing`: Polar through `@polar-sh/better-auth`, an idempotent `pnpm polar:seed` for the meter, benefits, products and webhook.
- Credits sized to drops: research 3, design 2, assist 1 (autopilot pick or review, ad copy).
- Proposed plans: Free 15 credits a month, Studio $29 for 300, Label $79 for 1,000 (rolls over), a 100-credit pack for $10 that never expires. Autopilot on paid plans only.
- An append-only credit ledger with row-locked reservations: reserve before a paid step, settle after, release on failure.
- Webhook-only sync from Polar, each event processed once.
- `/pricing` and `/dashboard/billing` pages, upgrade screens and PostHog billing events.
- Launch Free only: paid plans and packs stay behind the `billing-paid-plans` flag (off), so Qloo is never part of a paid product.
- `polar:seed` creates the webhook endpoint and writes its secret to Secret Manager.
- **BREAKING**: removes the email allowlist and `SPEND_*` limits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `billing-and-credits`: replaces spend limits with plans and credits.

## Impact

New `packages/billing`, billing tables and migrations, `packages/api` paid steps, `apps/web` pricing and billing pages, `infra` Polar secrets and a manual `polar:seed` job. Paid steps refuse until Polar is configured in production.
