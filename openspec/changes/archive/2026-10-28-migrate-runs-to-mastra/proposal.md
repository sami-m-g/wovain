# Proposal

PR: none yet. Status: in progress.

## Why

Runs execute inside one web request (`packages/api/src/flow/runs.ts`), so a long autopilot run can hit the Cloud Run timeout, a restart leaves a run `running` forever, a retry can duplicate a Fourthwall product or Meta campaign, and a manual approval ends the run instead of resuming it. Nothing measures the quality of briefs, judgments or ad copy. The founder chose to go all-in on Mastra rather than hand-roll orchestration, durability, memory, evals and tracing.

## What Changes

- A Mastra instance with storage and memory on `@mastra/pg` (same Cloud SQL database, own schema).
- Agents for the brief writer, judge, ad copywriter and autopilot reviewer; tools wrapping the existing Qloo, Tavily, fal, Fourthwall and Meta clients in `packages/core`.
- A run workflow: research → design → judge → approval → product → publish → campaign. Approval is a workflow suspend; the designer's decision (or the autopilot review) resumes it.
- `runs.start` returns the run at once; clients poll `runs.get`. Runs resume from their last stored step after a restart.
- External writes are idempotent: a retried step reuses the external id it already created.
- Scorers on every agent and step (code scorers plus LLM judges calibrated against a labeled set), input and output guardrails, and tracing with the run id; scores sent to PostHog as `agent_score`.
- Architecture targets from the 2026-10-26 audit that this change carries: state preconditions on approve and reject, a run step record, and prompt and model provenance on rows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runs-and-approval`: runs become durable workflows that suspend for approval and resume.
- `quality-scoring`: adds scorers on every step, calibrated judges and guardrails.

## Impact

New Mastra package and dependencies (`@mastra/core`, `@mastra/pg` and related, added through the pnpm catalog), `packages/api` flow and routers, `packages/core` providers exposed as tools, database schema for Mastra storage, `apps/web` run polling, PostHog events. Cloud Run timeout and CPU settings may change.
