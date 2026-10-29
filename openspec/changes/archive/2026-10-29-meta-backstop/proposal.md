# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/210

## Why

The profit rules (#141) run inside wovain every 30 minutes. If wovain is down, or Inngest or the Meta connection fails, nothing pauses an ad that is losing money. Meta's Automated Rules run on Meta's side. The single Meta grant can write them (`ads_management`; Graph readiness reads `adrules_library` since #182).

## What Changes

- `@wovain/core/meta-backstop`: the Meta rules that mirror each campaign's kill and stop rules, and a plan that creates the missing rules and deletes wovain's stale ones. Meta checks one ad or one campaign at a time and can't subtract profit, so the mirror is looser than wovain's own rules:
  - kills fire at 1.2 times wovain's limits, so wovain acts first;
  - the daily and monthly caps apply to each campaign's own spend;
  - the loss limit applies to a campaign with no purchase.
- Each rule's name carries the campaign, the rule and a hash of its spec. A changed threshold gets a new name, so a sync replaces it. The merchant's own rules are never touched.
- Graph (`@wovain/core/meta-graph`): list, create and delete automated rules (`/act_{id}/adrules_library`, `DELETE /{rule}`).
- `syncBackstop` runs in its own step of every optimizer tick, so it retries alone. Changing a cap or the loss limit requests a tick. An archived campaign loses its rules.
- Behind the new `meta-backstop-rules` flag: on in dev and next, off in production.

## Capabilities

### Modified Capabilities

- `ads-optimizer`: Meta backstop rules, kept in sync.

## Impact

- `packages/core`: `meta-backstop.ts` (new), `meta-graph.ts`, `flag-registry.ts`
- `packages/api`: `flow/backstop.ts` (new), `workflows/optimizer.ts`, the `campaigns.setLossLimit` and `autonomy.set` procedures
- Docs: Spending safely in en, es and fr; the landing FAQ
