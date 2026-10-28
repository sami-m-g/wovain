# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/65

## Why

A new designer has no single path from sign-up to a first drop. Connections sit on their own page, wovain only learns taste from approvals and rejections, the autonomy settings have no screen, and fal is still a merchant connection although wovain now pays for fal and meters it as credits. The Qloo and Nebius demos on next.wovain.com need a designer to be ready in a few minutes.

## What Changes

- A wizard at `/dashboard/onboarding`, behind the `onboarding-wizard` flag: connect Fourthwall and Meta, brand identity, autonomy level and spend caps, done. Sign-in stays Better Auth's.
- Brand identity: the designer enters 3 to 5 taste references. Each is resolved with Qloo `/search`. A reference Qloo doesn't know falls back to cultural proxies, ported from Alloy (MIT): a Tavily search, Nemotron names 3 to 5 concrete entities from the results, and each entity is resolved in Qloo. The references, the Qloo entities, the voice, the palette and the niches are saved to `brand_profile` and written to the taste memory's Voice, Palette and Niches lines.
- A connection health view: each provider reads connected, expired or missing, with what it is needed for. It shows on the wizard and on the connections page.
- fal stops being a merchant connection while the flag is on: designs draw on wovain's `FAL_KEY` through fal's queue API and are paid by the design credits. The fal card is hidden and a run no longer asks for fal.
- Credit costs for dev and next follow the final pricing: research 3, design 4 per product, assist 1; Free 25, Studio 250 and Label 800 credits a month. Production config is unchanged (it is frozen).

## Capabilities

### New Capabilities

- `onboarding`: the first-run wizard, brand identity from taste references, and the connection health view.

### Modified Capabilities

- `connectors`: fal is drawn on wovain's key while `onboarding-wizard` is on, and the merchant fal connection is hidden.

## Impact

- `packages/core`: `brand-identity.ts` (resolve references, cultural proxies, memory lines), a `search` method on the Qloo client, a `brand_proxies` agent, `falKeyCall` in `fal.ts`, `FAL_KEY` in `CoreConfig`.
- `packages/api`: `flow/onboarding.ts`, `routers/onboarding.ts`; `flow/connections.ts` and `flow/designs.ts` pick the platform fal key when the flag is on.
- `apps/web`: the wizard page and components, the connection health list, messages in en, es and fr; `FAL_KEY` in `.env.schema`.
- `infra`: `fal-key` becomes a per-environment secret (`fal-key-next`, `fal-key-dev`); the dev and next billing catalogs change.
- Dependency: `@fal-ai/client` (MIT), through the pnpm catalog.
- No database migration: `brand_profile` and `autonomy_setting` come from the foundation.
