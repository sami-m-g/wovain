# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/68

## Why

Autopilot today only means "Nemotron approves the gates of a run the merchant started". Nothing starts a run on its own, Free merchants can't use it, and the docs call it live. The Qloo and Nebius plan needs the opposite: wovain watches the taste graph and the news for each brand, proposes a drop when something fits, and acts as far as the merchant's autonomy level allows, with every step on record.

## What Changes

- An Inngest cron (every 6 hours) fans out one `wovain/autopilot.scan` event per brand profile. The per-brand scan is rate-limited to one run per brand per 6 hours and one at a time.
- The scan asks Qloo which brands are rising with the brand's audience (`/v2/insights`, `filter.type=urn:entity:brand`, `bias.trends=high`, signalled by the brand's Qloo entities) and searches Tavily news from the past week for the top rising names and for the brand's niches. A query with recent, relevant news becomes a suggestion (kind `drop`, trigger `qloo` or `trend`) with its evidence as sources. Repeats within 7 days are skipped.
- Each suggestion sends `wovain/trigger.fired` and a `wovain/notify` event (kind `suggestion`) that the mobile app consumes. Emit only.
- On `trigger.fired`, autopilot enqueues `autopilot.run.start` in the approval queue with a credit cost preview. The policy settles it by autonomy level: on `suggest` it waits for the merchant; on `draft` or higher it is approved by policy.
- On `approval.decided` (approved) for `autopilot.run.start`, an executor starts the run. The run decides its own gates (autopilot mode) only when the policy would also allow `store.product.publish`, i.e. on `publish_ads_paused`; otherwise it stops at the ideas gate for the merchant. Ads stay paused either way.
- A daily autopilot credit cap per plan (`autopilotDailyCredits` in the billing catalog). Autopilot never starts a run that would pass it.
- Autopilot on Free: the plan check also accepts the `autopilot` flag (on for every plan in dev and next), and the dev and next catalogs give Free autopilot.
- A narrated decision log at `/dashboard/autopilot`: suggestions with their evidence, what the policy decided and why, and the run it started. The merchant can start or dismiss a suggestion and run a scan now.
- Docs that call autopilot live are corrected.

Everything is behind the `autopilot-triggers` flag (on in dev and next, off in production).

## Capabilities

### New Capabilities

- `autopilot-triggers`: scheduled per-brand trend scans, suggestions with evidence, autopilot acting through the approval queue, the credit cap and the decision log.

### Modified Capabilities

- `billing-and-credits`: autopilot entitlement comes from the plan or the `autopilot` flag, with a daily credit cap per plan.

## Impact

- `packages/core`: `autopilot-signals.ts` (Qloo rising entities, Tavily week news, matching), one new event `wovain/autopilot.scan`.
- `packages/api`: `flow/autopilot.ts`, `workflows/autopilot.ts` (Inngest functions), `routers/autopilot.ts`; `assertAutopilot` uses the flag.
- `packages/billing`: `autopilotDailyCredits` per plan in the catalog.
- `apps/web`: `/dashboard/autopilot` page and sidebar link (only when the flag is on).
- `infra/Pulumi.prod.yaml`: `autopilotDailyCredits` for every environment; Free gets autopilot in dev and next only.
- No new tables or migrations: suggestions, approvals and decision traces use the foundation's tables.
