# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/42. PR: https://github.com/sami-m-g/wovain/pull/44. Status: shipped through the OAuth sign-in; the owner decided a pasted API key is not needed.

## Why

Merchants bring their own fal, Meta and Fourthwall accounts, so artwork costs are billed to them, not to wovain. The pricing and landing copy promise the merchant's own fal account.

## What Changes

- fal is a connected provider like Fourthwall: the merchant signs in to fal with OAuth and wovain stores the grant sealed with the owner and provider as AAD.
- `createArtist` draws through a session on the merchant's fal grant (`packages/core/src/fal.ts`), so artwork is billed to their fal account.
- Without a fal connection, the design step explains what is missing and links to the connection page.
- No API key is pasted or stored.

## Capabilities

### Modified Capabilities

- `connectors`: fal is connected with OAuth sign-in.

## Impact

`packages/core` (fal client per merchant grant, `upstream.ts`), `packages/api` connections and design step, `apps/web` connections page.
