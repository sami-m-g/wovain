# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/138

## Why

The founder will not put real money into Meta ads until wovain stops ads that do not sell, and stops them quickly. The ads optimizer reads only clicks. It runs every 6 hours and raises a budget on click-through rate alone. It never reads purchases, add-to-carts or revenue. The spend caps are checked only when a spend action is queued, so nothing stops a campaign whose real spend passes a cap or whose losses grow.

## What Changes

- New profit rules (`@wovain/core/ad-rules`) with named thresholds that each merchant can override:
  - Kill an ad when it spends 1x the target CPA with no purchase and no add-to-cart. With add-to-carts but no purchase, the limit is 2x. Also kill it when its CTR is under 0.8% after 1,000 impressions, or its CPC is over $1.50 after 10 clicks. The target CPA is the product's profit per sale, from its price and the highest base cost that price allows (`@wovain/core/pricing`). When every running ad is killed, or a sale leaves no profit, pause the whole campaign.
  - Stop: pause every campaign when today's spend reaches the daily cap, when the month's spend reaches the monthly cap, or when total spend minus the profit of sales reaches the merchant's loss limit ($50 by default).
  - Scale: raise the daily budget by at most 20%, at most every 48 hours. A raise needs ROAS of at least 1.3x break-even ROAS, at least 3 purchases, and an ad set that is no longer learning. It also stays within the daily cap.
- The optimizer reads purchases (`omni_purchase`), add-to-carts (`omni_add_to_cart`), and today's and this month's campaign spend from Meta. It runs every 30 minutes instead of every 6 hours.
- Kill and stop pauses are protective: the approval policy allows them at every autonomy level, because waiting is what loses money. Raises still wait for the merchant, inside the caps. Every action is written to the decision trace with its numbers, queued as an approval, and announced with a `wovain/notify` event.
- With the rules on, the bandit no longer raises a budget on clicks. It can still propose an ad pause, and its reviewer still checks those pauses.
- The campaign card says in plain words when wovain pauses and when it scales, and lets the merchant set the loss limit.
- Behind the new `ads-profit-rules` flag, on in dev and next.

## Capabilities

### Modified Capabilities

- `ads-optimizer`: profit-based kill, stop and scale rules, a 30-minute schedule, and protective pauses.

## Impact

- `packages/core`: `ad-rules.ts` (new), `optimizer-meta.ts` (purchases, add-to-carts, spend today and this month), `autonomy.ts` and `approvals.ts` (protective stops), `flag-registry.ts`
- `packages/db`: `autonomy_setting.loss_limit_cents` and `autonomy_setting.ad_rules` (migration `ads_profit_rules`)
- `packages/api`: `flow/optimizer.ts` runs the rules, `workflows/optimizer.ts` runs every 30 minutes, new procedures `campaigns.rules` and `campaigns.setLossLimit`
- `apps/web`: the campaign card shows the rules and the loss limit field; messages in en, fr and es
