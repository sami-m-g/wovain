# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/111

## Why

When Fourthwall or Meta isn't connected, the app shows an error: "Shop readiness: Fourthwall isn't connected" on Products, a red "The drop stopped" alert after a run, an "Error: ..." toast. Nothing is broken; the merchant has one account left to connect. An error reads as a failure and hides the one action that fixes it.

## What Changes

- A shared connect state: the provider's mark, one line on what connecting unlocks and a primary "Connect <provider>" button that starts the Connections page's flow and comes back to the same screen (query included).
- Products: until Fourthwall is connected, one connect state stands in for readiness, drops, products and orders.
- Insights, campaign controls, every flow problem notice and the design preview use it for a missing connection.
- A run that stopped for a missing connection shows the connect state; once the provider is connected it shows "Try again" in one click.
- The global query toast skips missing connections; the connection callback keeps the rest of the URL.
- fal is never named while wovain draws the art.
- A run failure for a missing connection is logged at warn level; every other failure stays at error level.

## Capabilities

### Modified Capabilities

- `app-ui`: connect states for missing connections.

## Impact

`apps/web` components and messages (en, es, fr), `packages/api/src/flow/runs.ts` logging.
