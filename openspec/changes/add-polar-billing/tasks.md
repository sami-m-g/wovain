# Tasks

## 1. Billing package

- [x] 1.1 Polar catalog in `packages/billing/src/plans.ts` and an idempotent `polar:seed`
- [x] 1.2 Append-only credit ledger with row-locked reservations (19 PGlite tests, including concurrent reserves)
- [x] 1.3 Webhook mirror with once-only processing (6 end-to-end tests)

## 2. Product

- [x] 2.1 Charge paid steps in credits and wire Polar through Better Auth
- [x] 2.2 Pricing page, billing page and upgrade screens
- [x] 2.3 Polar secrets and the manual `polar:seed` CI job

## 3. Before merge

- [ ] 3.1 Lock the plan numbers
- [ ] 3.2 Run against the Polar sandbox
- [ ] 3.3 Ship `add-fal-byo-connector`, so the pricing copy is true
- [ ] 3.4 Confirm the Qloo licence allows commercial use
- [ ] 3.5 Register the business and configure Polar production
- [ ] 3.6 Merge, then archive this change
