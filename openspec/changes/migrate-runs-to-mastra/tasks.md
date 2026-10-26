# Tasks

## 1. Runtime

- [ ] 1.1 Add Mastra and `@mastra/pg` through the pnpm catalog; create the Mastra instance with Postgres storage in its own schema
- [ ] 1.2 Wrap the `packages/core` providers as Mastra tools
- [ ] 1.3 Define the brief, judge, ad copy and autopilot reviewer agents with versioned instructions

## 2. Run workflow

- [ ] 2.1 Build the run workflow with one step per stage
- [ ] 2.2 Suspend at approval; resume on approve, reject or the autopilot review
- [ ] 2.3 `runs.start` returns at once; the dashboard and `get_run` poll the run
- [ ] 2.4 Idempotent product and campaign steps (pending row first, reuse external ids on retry)
- [ ] 2.5 Approve and reject only from `pending_approval` (state precondition)
- [ ] 2.6 Resume after a restart (test: kill mid-run, the run completes)

## 3. Quality

- [ ] 3.1 Code scorers: print size, avoided names, length limits, price floor
- [ ] 3.2 LLM judges for brief quality, idea fit and ad copy, calibrated against a labeled set
- [ ] 3.3 Input and output guardrails
- [ ] 3.4 Store scores with the run, trace each step and send `agent_score` to PostHog
- [ ] 3.5 Run the scorers in CI on prompt changes

## 4. Ship

- [ ] 4.1 Open the MR linked to its GitLab issue; update `docs/spec.md` in the same MR
- [ ] 4.2 Merge, then archive this change
