# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/58

## Why

Thirteen workstreams for the Qloo and Nebius deadlines (2026-10-30) need the same things: a brand profile, an autonomy level, one queue where every agent action waits for the merchant, a record of why an agent decided something, Inngest events, per-job Nemotron models and their feature flags. If each workstream added its own tables, migrations and flags, they would conflict. This change lands them once, small but correct, so the workstreams build on it in parallel.

## What Changes

- One Drizzle migration with the tables the workstreams need: `brand_profile`, `autonomy_setting`, `suggestion`, `approval` and its append-only `audit_event`, `drop` and `drop_item`, `decision_trace`, `device`, `ad_optimizer_state` and `performance_snapshot`.
- `@wovain/core/autonomy`: a closed catalog of agent actions with a risk class (R0 read to R4 money-moving), three autonomy levels (`suggest`, `draft`, `publish_ads_paused`) and `canAutoExecute(action, settings, spent)` → `allow | needs_approval | deny`. Refunds, cancels, destructive actions and anything that starts ad spend always need approval. Spend past the daily or monthly cap is denied.
- `@wovain/core/approvals`: the approval service (enqueue, decide, list, record) over a storage port, with a Drizzle store in `packages/api`. Every state change is audited and sent as an Inngest event.
- `@wovain/core/trace`: a decision trace (agent, model, input summary, output, sources), adapted from CreatorPulse's Agent Trace (MIT).
- `@wovain/core/events`: Inngest event names and zod schemas for triggers, approvals, optimizer ticks, performance snapshots and notifications.
- `@wovain/core/model-router`: `NEMOTRON_MODEL_FAST`, `_DEFAULT`, `_REASONING`, `_VISION` and `_SAFETY`, declared in `apps/web/.env.schema` and set per environment from Pulumi config. Agents are not rewired here.
- oRPC: `approvals.list`, `approvals.decide`, `autonomy.get`, `autonomy.set`, behind the new `autonomy-approvals` flag.
- Flags for every workstream (on in dev and next, off in production): `onboarding-wizard`, `qloo-taste-map`, `qloo-audiences`, `tavily-evidence`, `model-routing`, `autopilot-triggers`, `media-buying-live`, `ads-optimizer`, `feedback-loop`, `design-drops`, `store-management`, `mobile-app`, `voice-input`. The `autopilot` flag is on for every plan, Free included, in dev and next, and the billing status reports autopilot when the flag is on.

## Capabilities

### New Capabilities

- `autonomy-and-approvals`: autonomy levels, the action policy, the approval queue with its audit log, and decision traces.
- `model-routing`: the Nemotron model for each kind of job comes from the environment.

## Impact

- `packages/db`: new schema file `schema/autonomy.ts`, relations, one migration.
- `packages/core`: `autonomy`, `approvals`, `trace`, `events`, `model-router`; `core.models`; the flag registry and `infra/posthog/flags.json`.
- `packages/api`: `flow/approvals.ts`, `routers/approvals.ts`, an `events` sender on the context and actor, autopilot in the billing status.
- `apps/web`: `.env.schema` gains the five model variables; the context passes `events`.
- `infra`: five `nemotronModel<Role>` keys per environment (production frozen, so its template does not change).
