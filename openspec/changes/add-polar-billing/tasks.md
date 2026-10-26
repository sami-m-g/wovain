# Tasks

## 1. Billing package

- [x] 1.1 Polar catalog in `packages/billing/src/plans.ts` and an idempotent `polar:seed`
- [x] 1.2 Append-only credit ledger with row-locked reservations (19 PGlite tests, including concurrent reserves)
- [x] 1.3 Webhook mirror with once-only processing (6 end-to-end tests)

## 2. Product

- [x] 2.1 Charge paid steps in credits and wire Polar through Better Auth
- [x] 2.2 Pricing page, billing page and upgrade screens
- [x] 2.3 Polar secrets and the manual `polar:seed` CI job

## 3. Free-only launch

- [x] 3.1 `billing-paid-plans` flag (off): checkout refuses, paid products archived, pricing shows coming soon
- [x] 3.2 Existing merchants get Free on first use
- [x] 3.3 `polar:seed` writes the webhook secret to Secret Manager
- [ ] 3.4 Swap the flag read onto the typed registry from !121

## 4. Before paid plans

- [ ] 4.1 Lock the plan numbers
- [ ] 4.2 Run against the Polar sandbox
- [ ] 4.3 Ship `add-fal-byo-connector`, so the pricing copy is true
- [ ] 4.4 Confirm the Qloo licence allows commercial use
- [ ] 4.5 Register the business and configure Polar production
- [ ] 4.6 Archive this change
