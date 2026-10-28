# Tasks

## 1. Rescope

- [x] 1.1 Ads spec delta: activation only through approvals within caps
- [x] 1.2 `docs/scope.md`, `docs/prd.md`, `docs/spec.md` and the docs-site copies

## 2. Staging (core)

- [x] 2.1 `ad-delivery.ts`: Advantage+ targeting, sales or landing-page delivery, UTM links
- [x] 2.2 `stagePausedCampaign` takes `media`; legacy staging unchanged without it
- [x] 2.3 `media-buying.ts`: pixel lookup, read-back, activate, pause, status mapping
- [x] 2.4 Unit tests against a fake Meta MCP

## 3. Flow and API

- [x] 3.1 `createProductCampaign` with the flag: audience, pixel, read-back, status saved
- [x] 3.2 `flow/media.ts`: request activation, execute an approved action, pause now, sync
- [x] 3.3 `flow/audience.ts`: the audience seam for 2b
- [x] 3.4 `campaigns.activate`, `campaigns.pause`, `campaigns.sync`, `campaigns.liveBuying`
- [x] 3.5 Inngest `media-approval-executor` on `wovain/approval.decided`
- [x] 3.6 PGlite tests: staging, approval, cap denial, pause, failure, flag off

## 4. Web

- [x] 4.1 Campaign controls on the done step (status, start with inline approval, pause, refresh)
- [x] 4.2 Copy in en, fr and es

## 5. Later (not in this change)

- [ ] 5.1 Pixel health check (Purchase events in the last 7 days) before choosing the sales objective
- [ ] 5.2 Read Fourthwall's sales-by-UTM report into performance snapshots
- [ ] 5.3 Meta-side `campaign_spend_cap` and budget edits through `media.budget.change`
- [ ] 5.4 Qloo audience source (workstream 2b)
