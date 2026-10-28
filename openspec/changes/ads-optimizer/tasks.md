# Tasks

## 1. Bandit and guards (core)

- [x] 1.1 Beta sampling and Thompson P(best), with an injectable RNG (`packages/core/src/optimizer.ts`)
- [x] 1.2 Learning floor, breakdown-effect guard, cap-clamped budget rule, one edit per run
- [x] 1.3 Tests for the bandit and every guard (`optimizer.test.ts`)

## 2. Meta and the reviewer (core)

- [x] 2.1 Read a campaign's status, budget, ad counts and ad set learning, then pause an ad and set a campaign budget (`optimizer-meta.ts`)
- [x] 2.2 Agent `ads_optimizer_review` on `NEMOTRON_MODEL_REASONING`, plus the review prompt and schema

## 3. Flow and Inngest (api)

- [x] 3.1 `optimizeMerchant`: the flag check, read, state upsert, propose, review, enqueue and trace (`flow/optimizer.ts`)
- [x] 3.2 `executeOptimizerApproval`: the Meta write, record, state update, trace
- [x] 3.3 Inngest functions cron, tick and execute, registered in `workflows/engine.ts`
- [x] 3.4 PGlite tests of the flow with a fake Meta and a fake reviewer

## 4. Checks

- [x] 4.1 `pnpm run check`, `check-types`, `knip`, `spec:validate` and package tests
