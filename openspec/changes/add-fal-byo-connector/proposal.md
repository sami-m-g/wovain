# Proposal

MR: none yet. Status: in progress. Blocks `add-polar-billing` going live.

## Why

Merchants bring their own fal, Meta and Fourthwall accounts, so artwork costs are billed to them, not to wovain. Today every image uses wovain's `FAL_KEY` (`packages/core/src/core.ts`), and the pricing and landing copy already promise the merchant's own fal account.

## What Changes

- A fal connection that takes the merchant's API key, sealed like the OAuth tokens.
- `createArtist` uses the merchant's key for their runs.
- Without a fal connection, the design step explains what is missing and links to the connection page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `connectors`: adds an API-key connection for fal.

## Impact

`packages/core` (fal client per merchant), `packages/api` connections router and design step, `apps/web` connections page, `packages/db` connection provider values.
