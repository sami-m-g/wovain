# Design

## Context

The store-management scoping (risk classes R0 to R4, one queue for store and media buying), the media-buying plan (audit log B7, metrics store M13, optimizer M14), the drops plan (`drop` and `drop_item`), the mobile plan (`device` table, `wovain/notify`) and the founder's decisions of 2026-10-28 (autonomy level in the brand wizard, autopilot on trend and Qloo triggers, Thompson-sampling optimizer, spend caps as hard limits) all need shared state. This change builds that state and its contracts, and nothing that executes an action.

## Decisions

### One queue, one audit log

`approval` holds every proposed write from every domain (`store`, `media`, `autopilot`). Its lifecycle is `pending → approved | rejected | denied | expired`, then `approved → executing → done | failed`, and `done → reverted`. The policy settles an action at enqueue: `allow` stores it as `approved` with `decidedBy = "policy"`, `deny` stores it as `denied`. `audit_event` is append-only and also records autonomy setting changes. The idempotency key is unique per user, so a retried enqueue returns the first row.

Alternative considered: separate `store_action` and `campaign_action` tables. Rejected: the store scoping and the media plan both ask for one table, and the mobile inbox reads one list.

### Policy in core, storage in api

`canAutoExecute` is pure and the approval service takes a storage port (`ApprovalStore`), because `@wovain/db` depends on `@wovain/core` and not the other way. The Drizzle store does a conditional update (`WHERE status IN (...)`), so two decisions on one approval can't both win.

### Autonomy levels

| Level                | Runs alone                        |
| -------------------- | --------------------------------- |
| `suggest`            | R0 only                           |
| `draft`              | R0, R1                            |
| `publish_ads_paused` | R0, R1, R2 that don't start spend |

R3 and R4 always need approval, and so does any action marked `spends`. The merchant's `paused` switch makes every write need approval. Spend over the daily or monthly cap is denied, at enqueue and again at approval, because spend may have moved in between. Spend to date comes from campaign-level Meta `performance_snapshot` rows.

### Events

Event names and zod schemas live in `@wovain/core/events`; `packages/api` sends them through the run engine's Inngest client (`context.events.send`) and wraps the schemas with Inngest's `eventType` where it defines functions. Executors listen for `wovain/approval.decided` with status `approved`.

### Decision trace

Adapted from CreatorPulse's `Trace` (MIT, attribution in `trace.ts`): entries are collected in order, a failed call is recorded and rethrown, and `flush()` saves new entries through a sink (`traceSinkFor` in `packages/api`).

### Model routing

Five env vars, one per job, declared in `apps/web/.env.schema` with local defaults (as `NEMOTRON_MODEL` is) and set from Pulumi config per environment (`nemotronModelFast`, `-dev`, `-next`). The values today reuse the IDs already in use (Super VL, and Lightning for fast and safety). The model-routing workstream confirms the Token Factory IDs for Ultra, Nano and the safety model and rewires the agents.

### Flags

Every workstream flag is declared here with `release` type, an owner team and an expiry of 2027-01-31, on in development and next and off in production. `autonomy-approvals` guards the new procedures. `autopilot` is now on for all users in development and next (production stays internal); the billing status reports autopilot when the plan includes it or the flag is on.

## Risks

- A new PostHog project for next creates flags with `initiallyActive`; an existing project keeps its Status, so the `autopilot` Status must be on there.
- The default model IDs for reasoning and safety are placeholders until the model-routing workstream confirms the catalog.
- Lowering a budget is `media.budget.change` and needs approval at every level; a separate protective action can be added to the catalog.
