# Design

## Context

Meta's Ads MCP (`mcp.facebook.com/ads`) runs in draft mode for wovain's app. `ads_create_campaign`, `ads_create_ad_set` and `ads_create_ad` take no status. They stage objects in the account's Ads Manager draft and answer `status=DRAFT`. `ads_activate_entity` with `object_ids` and `publish_as_active=true` publishes exactly those objects as ACTIVE, which spends. Accounts outside draft mode get live objects created PAUSED. A status-only `ads_update_entity {status: PAUSED}` pauses a live object at once. Calling activate after a pause can undo it.

The foundation change gives one approval queue with a policy (`canAutoExecute`), caps read from Meta campaign snapshots, an `approval.decided` Inngest event, and decision traces.

## Decisions

1. **Activation is an approval, never a direct call.** `media.campaign.activate` is R2 with `spends: true`. The policy therefore always asks the merchant (or denies over a cap), whatever the autonomy level. `decide` re-checks the caps. The request ID makes the request idempotent (`media.campaign.activate:<campaign>:<requestId>`).
2. **Execution is event-driven and idempotent.** The executor runs on `wovain/approval.decided` (approved, media). It moves the approval to `executing` once. A second delivery hits `BAD_TRANSITION` and stops. Inngest concurrency is 1 per approval.
3. **Read back, don't trust.** Staging ends with `verifyStagedPaused`: draft membership first (`object_state=draft`), then live statuses per level. Anything not PAUSED gets the campaign paused, and the staging throws. After every activation or pause, `readCampaignStatus` sets `campaign.status`. Meta's `PUBLISHING` and `IN_PROCESS` are reported as such and never as live.
4. **Pause is the safe direction.** The merchant's pause is queued and audited like every action, approved by the merchant in the same request, and executed inline. The event's second execution is a no-op.
5. **Sales objective only with a known pixel.** Meta allows no website goal under `OUTCOME_SALES` without a conversion signal. wovain uses the account's pixel only when there is exactly one (or the caller names it). It never guesses between several. No pixel means `OUTCOME_TRAFFIC` with `LANDING_PAGE_VIEWS`, a better proxy than link clicks.
6. **Advantage+ by default.** Following Meta's guidance and the claude-ads and meta-ads-analyzer playbooks (MIT), wovain uses one CBO campaign with lowest-cost bidding and one broad ad set. Advantage+ audience and placements stay on, ages and genders are suggestions, and `age_min` is never below 18. Interests are not sent: the MCP has no targeting search, and invented interest IDs are rejected.
7. **Audience seam for 2b.** `AudienceSource` (`flow/audience.ts`) maps a request to `AdTargeting`. Today it reads `brand_profile.demographics`. The Qloo audiences workstream fills those demographics, or swaps the source.
8. **No migration.** `campaign.status` is a text column whose enum lives in TypeScript, so new states need no SQL.

## Risks

- **Meta App Review.** Live publishing for accounts outside the app's roles needs Advanced Access (`ads_management`, `ads_mcp_management`) and Business Verification. Until then only app admins and testers can go live.
- **Pixel on the storefront.** No MCP tool sets Fourthwall's Meta pixel or CAPI. The merchant turns it on in Fourthwall. A pixel without Purchase events still trains a sales campaign poorly.
- **Draft read-back shape.** `ad_drafts[].ad_object_id` follows the MCP's documented contract. If draft reads are not enabled on an account, the live read-back is used.
- **Currency.** Caps and costs are US cents. An ad account in another currency gets its budget in its own minor unit; the cost preview says USD.
