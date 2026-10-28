# Tasks

## 1. Core

- [x] 1.1 Qloo client: `search(query, take)` across every entity type, returning `{ id, name, type }`
- [x] 1.2 `brand-identity.ts`: `resolveReferences` with the direct path and the cultural-proxies fallback (Alloy, MIT), per-reference errors logged at error level
- [x] 1.3 `brand-identity.ts`: `writeBrandMemory` replaces the Voice, Palette and Niches lines
- [x] 1.4 `brand_proxies` agent id
- [x] 1.5 `fal.ts`: `falKeyCall(apiKey)` on `@fal-ai/client`'s queue; `FAL_KEY` in `CoreConfig`, `core.falKey`
- [x] 1.6 Tests for 1.1 to 1.5

## 2. API

- [x] 2.1 `flow/onboarding.ts`: status (flag, connection health, brand, autonomy), resolve, save brand
- [x] 2.2 `routers/onboarding.ts` wired into `appRouter`
- [x] 2.3 `flow/connections.ts` and `flow/designs.ts`: platform fal key when the flag is on
- [x] 2.4 Tests for the status, the save and the platform fal switch

## 3. Web

- [x] 3.1 Wizard page and components (connect, brand, autonomy, done), mobile first
- [x] 3.2 Connection health on the wizard; the connections page, overview summary and checklist hide fal when wovain draws
- [x] 3.3 Setup checklist and breadcrumb link to the wizard while it is on (no sidebar entry: the checklist is the entry point)
- [x] 3.4 Messages in en, es and fr, copy through the humanizer
- [x] 3.5 `FAL_KEY` in `apps/web/.env.schema`

## 4. Config

- [x] 4.1 `fal-key` per environment in `infra/index.ts`
- [x] 4.2 dev and next billing catalogs: research 3, design 4, assist 1; Free 25, Studio 250, Label 800
- [x] 4.3 `pnpm run check`, `check-types`, `knip`, `spec:validate` and package tests pass
