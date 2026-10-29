# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/142

## Why

The founder sells today, and the target is 10 minutes from nothing to a running campaign, account setup included. A connected Fourthwall shop isn't yet a shop that sells: it may be coming soon, without payouts or shipping, and without the Meta pixel that lets campaigns optimize for sales. The merchant shouldn't have to leave wovain to find out what's missing, or guess when a step in Fourthwall is done.

## What Changes

- A Store setup checklist on the Store page, above the summary: shop connected (as owner or manager), payouts, shop live, shipping, the Meta pixel on the shop, custom domain (optional) and policies (review).
- Each open step is either "Do it for me" through the approval queue (going live, R3) or a one-click deep link into Fourthwall. The page polls every 10 seconds while a required step is open, so a step finished in Fourthwall ticks off by itself.
- The pixel step finds the merchant's pixel on their Meta ad account, shows its ID to paste in Fourthwall, links to the storefront for a test visit, and ticks off when Meta's dataset stats show events from the shop's host in the last 7 days.
- Without a connected shop, the connect state polls every 5 seconds, so a shop created and connected in another tab moves the page on.
- Each "Do it for me" is recorded in the decision trace (agent `store_setup`). A part of the checklist that can't be read is logged at error level and shown as unknown; it doesn't fail the whole checklist.
- `store.setup` returns the typed list of steps with status (`StoreSetupStep` in `apps/web/src/lib/flow-client.ts`) for the onboarding checklist.

## Capabilities

### Modified Capabilities

- `store-management`: Store setup.

## Impact

`packages/core` (store setup reads), `packages/api` (store setup flow and router), `apps/web` (checklist, messages in en, es and fr).
