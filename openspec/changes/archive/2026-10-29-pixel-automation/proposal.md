# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/205

## Why

The store's pixel step (#156, #179) needs exactly one Meta pixel on the ad account and leaves its creation to the designer in Events Manager. The single Meta grant already carries `ads_management` and `business_management`, and #182 checks that Graph accepts it. wovain can therefore do the whole Meta side itself. Only the paste into Fourthwall is left to the designer, because Fourthwall has no API for its pixel setting.

## What Changes

- Graph (`@wovain/core/meta-graph`): list the ad account's datasets with their last event; create a dataset under the owning business (`POST /{business}/adspixels`) and share it with the ad account (`POST /{dataset}/shared_accounts`), or on a personal ad account (`POST /act_{id}/adspixels`); send a Conversions API test event (`POST /{dataset}/events` with `test_event_code`).
- `@wovain/core/pixel-setup`: choose among several datasets (the one wovain created, else the last to fire), name new ones `wovain - <shop>`, and make test event codes.
- `store.setupPixel`: finds or creates the dataset, shares it, sends the test event and records an audit event. The store checklist reads the same dataset when the ad account has several.
- The pixel card gets **Set up my pixel** when no pixel is found, and **Send a test event** while the pixel isn't firing. Fourthwall's guided paste card stays. The step still ticks off from Meta's events from the shop's hosts (`pixelOnShop`).
- Behind the new `meta-pixel-automation` flag: on in dev and next, off in production.

## Capabilities

### Modified Capabilities

- `store-management`: pixel set-up on the single Meta grant.

## Impact

- `packages/core`: `meta-graph.ts`, `pixel-setup.ts` (new), `flag-registry.ts`
- `packages/api`: `flow/pixel-setup.ts` (new), `flow/store-setup.ts`, `routers/store.ts`
- `apps/web`: the pixel card; messages in en, es and fr
- Docs: the Store guide in en, es and fr
