# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/64

Stacks on `foundation-autonomy-approvals` (issue #58, PR #60). It uses that change's approval queue, autonomy settings, spend caps, decision traces and the `media-buying-live` flag.

## Why

The ads spec says "wovain SHALL never activate spend", and `docs/scope.md` cuts "automatic activation of ad spend". The founder now wants wovain to run real media buying for indie designers, so this rule has to change first, and the change has to be safe.

The current staging also can't be trusted or measured:

- Meta's Ads MCP stages every create as a draft. wovain never reads the objects back, and the database says `paused` forever.
- Campaigns use the traffic objective with `LINK_CLICKS`, no pixel and no UTM, so no sale can be credited to an ad and ROAS stays empty.
- Targeting is countries only.

## What Changes

- **Rescope.** wovain may take a campaign live, but only through the approval queue, and only inside the merchant's daily and monthly spend caps (`media.campaign.activate` is R2 and spends, so it always needs an explicit approval and a cap breach denies it). Updates to the ads spec, `docs/scope.md`, `docs/prd.md`, `docs/spec.md` and their docs-site copies.
- **Read-back.** After staging, wovain reads every object back. Each must be in the draft or live and PAUSED. Anything else is paused at once and the staging fails. The status is saved on `campaign.status` (`draft`, `paused`, `publishing`, `in_review`, `active`, `with_issues`, `archived`, `unknown`), and `campaigns.sync` refreshes it from Meta.
- **Sales objective.** When the ad account has exactly one pixel (Fourthwall's native Meta pixel and CAPI integration fires it), the campaign is `OUTCOME_SALES` with `OFFSITE_CONVERSIONS` on `PURCHASE`. Otherwise it is `OUTCOME_TRAFFIC` with `LANDING_PAGE_VIEWS`. Every ad link carries `utm_source=meta`, `utm_medium=paid_social`, `utm_campaign=<Meta campaign ID>` and `utm_content=<angle>-<n>`.
- **Audience.** One CBO campaign with one broad ad set. Advantage+ audience stays on, the merchant's countries are hard limits, and ages and genders from `brand_profile.demographics` are suggestions. `flow/audience.ts` is the seam for workstream 2b (Qloo audiences).
- **Activation.** `campaigns.activate` enqueues the approval. The merchant approves it with `approvals.decide`, which shows the daily cost. An Inngest function on `wovain/approval.decided` (status `approved`, domain `media`) publishes the draft with `publish_as_active`, or activates a live paused campaign top-down. It then reads the status back, saves it, records the outcome and a decision trace, and logs failures at error level.
- **Pause.** `campaigns.pause` queues `media.campaign.pause`, approves it as the merchant and pauses the campaign at once.
- **UI.** The finished-drop card shows the status with Start, Pause and Refresh controls, and an inline approval that names the daily budget.
- Everything new is behind `media-buying-live` (and `autonomy-approvals`), which is on in development and next and off in production. With the flag off, staging stays exactly as before.

## Capabilities

### Modified Capabilities

- `ads-and-campaigns`: campaigns may go live through an approval within caps; staging is verified, measured and synced.

## Impact

- `packages/core`: `ads.ts` (delivery options), new `ad-delivery.ts` and `media-buying.ts`
- `packages/api`: `flow/campaigns.ts`, new `flow/media.ts`, `flow/audience.ts`, `routers/media.ts`, `workflows/media.ts`; `workflows/engine.ts` registers the executor
- `packages/db`: `campaign.status` gains values (a text column, no migration)
- `apps/web`: `campaign-controls.tsx` on the done step, with copy in en, fr and es
- Docs: `docs/{scope,prd,spec}.md` and the docs-site copies
