# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/69

## Why

The Meta campaigns wovain stages target countries only. Qloo knows who likes a brand's taste references: their age, their gender lean and the audience segments they belong to. None of that reaches the ads or the ad copy, and the docs already claim "Meta audiences come from Qloo". Qloo's judges also ask whether the product would work the same without Qloo. With this change, the answer is no: Qloo picks who sees the ads.

## What Changes

- `@wovain/core/qloo` gains `demographicsOf` (Qloo `urn:demographics`), `audienceAffinity` (one `urn:audience` against the brand's entities) and `searchEntities`.
- `@wovain/core/qloo-audiences`: 27 Qloo audiences an apparel brand can advertise to, each with the words to search Meta for. Adapted from ResonanceAI (Apache-2.0, attributed). Sensitive categories are left out.
- `@wovain/core/meta-interests`: Meta's interest search (`GET /search?type=adinterest`), called with wovain's app token, and a match rule that keeps only interests Meta names like the query. Pattern from mikusnuz/meta-ads-mcp (MIT, attributed).
- `@wovain/core/targeting`: the Qloo to Meta mapper.
  - Age buckets become `age_min` and `age_max`, and a clear gender lead becomes `genders`.
  - Audiences that like the brand's brands more than the average audience does are kept.
  - Those audiences and the brand's Qloo entities become Meta interest IDs.
  - Every match is kept as evidence, every step goes into the decision trace, and the merchant's own ages and genders win.
- Campaign staging (`createProductCampaign`) targets the ad set with it and gives the ad copy writer the audience persona, behind the `qloo-audiences` flag. Countries stay a hard control.
- oRPC `targeting.preview({ countries })` returns the targeting and its evidence, for the UI and media buying.
- `META_GRAPH_URL`, declared in `apps/web/.env.schema` and set from `infra/index.ts`.

## Capabilities

### New Capabilities

- `audience-targeting`: Qloo demographics and audiences turned into Meta targeting with evidence.

### Modified Capabilities

- `ads-and-campaigns`: the ad set is targeted with Qloo's audience when the flag is on.

## Impact

- `packages/core`: `qloo`, `qloo-audiences`, `meta-interests`, `targeting`, `ads`, `core` (`core.qloo`, `core.metaInterests`).
- `packages/api`: `flow/audiences.ts`, `flow/campaigns.ts`, `routers/audiences.ts`.
- Config: `META_GRAPH_URL` in `.env.schema`, `infra/index.ts`, `turbo.json` and the Mastra Studio env.
- No migration: the brand profile and decision trace tables come from the foundation (#58).
