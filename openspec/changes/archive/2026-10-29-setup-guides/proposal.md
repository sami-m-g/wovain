# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/175

## Why

The pixel and payouts steps of Store setup link to Fourthwall's general settings page and say little more. A beginner then has to find the right page and work out what to do. Payouts that Fourthwall support sets up by hand (PayPal or bill.com, where Stripe isn't available) never show as active, so the step can never tick off.

Research (2026-10-29): no API can set the Meta pixel on a Fourthwall shop. The Fourthwall MCP (`tools/list`, server 3.4.11) has no pixel, tracking or settings write. The Platform API (`openapi/platform.json`, 80 paths) and the Channel API (5 paths) have none. Fourthwall's help center sets the pixel in Analytics > Tracking pixels and server events in the Meta Conversions app (Pixel ID plus an access token from Events Manager). Payout status is readable (`get-payout-info`: INACTIVE, IN_PROGRESS, ACTIVE), but payouts set up by support aren't.

## What Changes

- Exact Fourthwall pages from its help center: Tracking pixels, Meta Conversions, and Billing and payouts.
- Pixel: the pixel ID with a copy button, three plain steps, the Tracking pixels page, and a pointer to the Conversions API. It still ticks off when Meta sees events from the shop's host.
- Payouts: three plain steps, different text while Stripe still needs details, the PayPal or bill.com route, and **Fourthwall support set up my payouts**. That queues `store.setup.confirm` (R1, in the merchant's name), and the step then shows as done on the merchant's word.

## Capabilities

### Modified Capabilities

- `store-management`: guided pixel and payouts steps.

## Impact

`packages/core` (`store.setup.confirm`, setup evaluation), `packages/api` (the confirmation request, setup reads it back), `apps/web` (setup steps, admin pages, messages), docs (Connecting your accounts) in en, es and fr.
