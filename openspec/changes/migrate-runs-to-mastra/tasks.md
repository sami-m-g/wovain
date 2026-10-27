# Tasks

Design: `docs/adr/0001-durable-runs.md`, `docs/adr/0002-agent-quality.md`.

## 1. Runtime

- [x] 1.1 Add Mastra and `@mastra/pg` through the pnpm catalog; create the Mastra instance with Postgres storage in its own schema (`mastra`)
- [ ] 1.2 Wrap the `packages/core` providers as Mastra tools (deferred: provider calls stay workflow steps; no agent calls tools)
- [x] 1.3 Define the brief, judge, ad copy and autopilot reviewer agents with versioned instructions
- [x] 1.4 Route runs to the workflow only behind the `mastra-runs` flag, with the legacy flow as the fallback (`run.engine`)

## 2. Run workflow

- [x] 2.1 Build the run workflow with one step per stage (Mastra on Inngest)
- [x] 2.2 Suspend at approval; resume on approve, reject or the autopilot review
- [x] 2.3 `runs.start` returns at once; the dashboard and `get_run` poll the run
- [x] 2.4 Idempotent product and campaign steps (pending row first, reuse external ids on retry)
- [x] 2.5 Approve and reject only from `pending_approval` (state precondition)
- [x] 2.6 Resume after a restart (test: a crashed step replays without duplicate writes)

## 3. Quality

- [x] 3.1 Code scorers: print size, avoided names, length limits, price floor
- [ ] 3.2 LLM judges for brief quality, idea fit and ad copy, calibrated against a labeled set
  - [x] 3.2.1 Six binary judges (design quality, brand fit, trend fit, IP risk, ad copy quality, Meta policy) and the calibration math (TPR/TNR, Rogan-Gladen, bootstrap)
  - [ ] 3.2.2 Once production runs on Mastra (`mastra-runs` on), sample about 100 real traces per judge from Mastra's store, balanced Pass and Fail
  - [ ] 3.2.3 Label them through a lightweight review queue: Mastra Studio's trace and score views where they allow labelling, otherwise a simple internal page
  - [ ] 3.2.4 Iterate on the dev split to TPR and TNR above 0.9 (0.8 minimum), run the test split once, and fill `packages/core/src/evals/baseline.v1.json`
- [x] 3.3 Input and output guardrails
- [x] 3.4 Store scores with the run, trace each step and send `agent_score` to PostHog
- [x] 3.5 Run the scorers in CI on prompt changes (`evals:judges`)

## 4. Ship

- [ ] 4.1 Open the PR linked to its GitHub issue; update `docs/spec.md` in the same PR
- [ ] 4.2 Merge, then archive this change
