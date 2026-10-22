# Measurement through Fourthwall

Builds on `ads-attribution` and `ads/references/conversion-tracking.md`: report platform-attributed and shop numbers side by side, over one window and one definition of a sale, and never add them.

### POD-M1 Pixel and CAPI

Fourthwall fires Meta's standard pixel events itself and can send server events through the Conversions API once a Meta dataset is connected to the shop (Fourthwall help: [Meta pixel](https://help.fourthwall.com/manage-my-shop/apps-features-and-integrations/set-up-meta-pixel.md), [Conversions API](https://help.fourthwall.com/manage-my-shop/apps-features-and-integrations/facebook-conversions-api.md)). Meta recommends both together, deduplicated by event ID. A dataset with no CAPI events, or R1 failing, raises `tracking_gap`: kills are blocked, and the fix links to Fourthwall's CAPI guide.

### POD-M2 Shop first

Every ad link carries `utm_content={{ad.id}}` (`URL_TAGS` in `apps/server/src/tools/campaign.ts`). Per ad, the sale count is net sales with that `utm_content`. Meta's purchases sit next to it and feed R1; view-through sales the shop can't attribute stay a signal. If the merchant turned tagging off (`rules.tagUtmContent: false`), only design-level and campaign-level decisions run (by product and by source), and confidence drops one step.

### POD-M3 Missed sale

A paused ad (paused by Meta's rules or by the optimizer) with a net sale by UTM after its pause check gets `resume_ad` (PRD state 7).
