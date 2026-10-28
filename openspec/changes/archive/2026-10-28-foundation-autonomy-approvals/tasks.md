# Tasks

Issue #58.

## 1. Schema

- [x] 1.1 `packages/db/src/schema/autonomy.ts`: brand profile, autonomy setting, suggestion, approval, audit event, drop, drop item, decision trace, device, ad optimizer state, performance snapshot
- [x] 1.2 Relations and one migration from `pnpm run db:generate`

## 2. Core

- [x] 2.1 Action catalog, autonomy levels and `canAutoExecute`
- [x] 2.2 Approval service over a storage port: enqueue, decide, list, record, audit, events
- [x] 2.3 Decision trace adapted from CreatorPulse (MIT, attributed)
- [x] 2.4 Inngest event names and zod schemas
- [x] 2.5 Model router from `NEMOTRON_MODEL_*`, exposed as `core.models`

## 3. API

- [x] 3.1 Drizzle approval store, autonomy settings, spend to date and trace sink
- [x] 3.2 `approvals.list`, `approvals.decide`, `autonomy.get`, `autonomy.set` behind `autonomy-approvals`
- [x] 3.3 `events` sender on the context and actor
- [x] 3.4 Billing status reports autopilot when the `autopilot` flag is on

## 4. Config and flags

- [x] 4.1 Five model env vars in `apps/web/.env.schema`, the Mastra Studio entry and Pulumi config per environment
- [x] 4.2 Workstream flags and `autonomy-approvals`, on in dev and next and off in production; `autopilot` on for all plans in dev and next; `infra/posthog/flags.json` regenerated

## 5. Tests

- [x] 5.1 Policy tests (levels, refunds and cancels, caps, pause, unknown actions)
- [x] 5.2 Approval service tests in memory, and the Drizzle store on PGlite with the migrations
- [x] 5.3 Trace and model router tests
