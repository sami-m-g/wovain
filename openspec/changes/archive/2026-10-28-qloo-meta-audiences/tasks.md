# Tasks

Issue #69. Stacks on #58 (foundation).

## 1. Core

- [x] 1.1 Qloo client: `demographicsOf`, `audienceAffinity`, `searchEntities`
- [x] 1.2 Qloo audience catalog adapted from ResonanceAI (Apache-2.0, attributed)
- [x] 1.3 Meta interest search with the app token and the match rule (pattern from mikusnuz/meta-ads-mcp, MIT, attributed)
- [x] 1.4 The mapper: ages, gender, audiences, interests, evidence and trace steps; failures logged at error level
- [x] 1.5 `stagePausedCampaign` takes the targeting; `writeAdCopy` takes the persona

## 2. API

- [x] 2.1 `audienceFor(actor)` from the brand profile, with the decision trace saved
- [x] 2.2 `createProductCampaign` uses it behind `qloo-audiences`, kept with the staging's key
- [x] 2.3 oRPC `targeting.preview`

## 3. Config

- [x] 3.1 `META_GRAPH_URL` in `.env.schema`, `infra/index.ts`, `turbo.json` and the Mastra Studio env

## 4. Tests

- [x] 4.1 Mapper, match rule, Graph request, merchant override and failure tests in core
- [x] 4.2 A staging with the flag on targets the ad set and saves the trace (PGlite)
