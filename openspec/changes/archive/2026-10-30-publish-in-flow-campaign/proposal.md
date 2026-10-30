# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/332

## Why

On a real run on next, Publish to Fourthwall in the drop's Products step only queued an approval: with store management on, the product sat in review and the button was disabled. The founder had to find the approval elsewhere, and the drop never reached its Campaign step, which only opens once a product is live.

## What Changes

- From the website, the merchant's click on Publish is the approval: one confirm shows the product, its price and the shop, then `products.publish` publishes at once (after the shop readiness check with `store-management` on). Agent (MCP) and autopilot publishes still go through the approval queue.
- Once every product is live, the drop goes on to its Campaign step. A completed run with products and no campaign resumes there, not at done.
- The Campaign step shows the ad creatives, the ad copy, Qloo's audience, the daily budget and the spend rules, with one Launch campaign button: it stages the paused campaign if needed, and its confirm asks the campaign to go live and approves it in the merchant's name (`campaigns.activate`, then `approvals.decide`). Without live media buying, the campaign stays paused for Ads Manager, as before. Without Meta, the step shows the creatives and Connect Meta to launch.
- The progress tape and the drop page tick Campaign only once the merchant reaches done; a completed run's Campaign section waits until a campaign exists.

## Capabilities

### Modified Capabilities

- `store-management`: the designer's own publish from the drop flow is not queued.
- `ads-and-campaigns`: the drop's Campaign step and its one Launch campaign.
