# Design

## Context

The foundation (PR #60) adds `brand_profile`, `autonomy_setting`, `autonomy.get/set` and the `onboarding-wizard` flag. Connections already run through `flow/connections.ts` (OAuth grants sealed per provider). Qloo is a plain-fetch client in `packages/core/src/qloo.ts`; Tavily and Nemotron are on `core.trends` and `core.nemotron`. The taste memory is Mastra working memory with a fixed template (`packages/core/src/taste.ts`).

## Goals / Non-Goals

Goals:

- One wizard a designer finishes in a few minutes on a phone.
- Brand references that become real Qloo entity IDs, the input the Qloo taste map and audience workstreams read from `brand_profile.qlooEntities`.
- fal drawn on wovain's key, so a designer never needs a fal account.

Non-goals:

- Palette extraction from images, and Qloo demographics (the `qloo-audiences` workstream fills `brand_profile.demographics`).
- New credit steps (revision, campaign staging) and new plans (Brand, Enterprise, annual): later billing work.
- Changing production config.

## Decisions

1. **Resolving references.** `resolveReferences(refs, deps)` in `packages/core/src/brand-identity.ts` runs each reference independently (`Promise.allSettled` semantics, written as per-reference try/catch). Direct path: Qloo `/search?query=<ref>&types=<all entity types>&take=1`. One call with every type, rather than Alloy's loop over nine types, because the Qloo API accepts a comma-separated `types` and the existing client already does so.
2. **Cultural proxies (ported from Alloy, MIT, `backend/src/services/react_agent.py` `_extract_cultural_proxies`).** On a miss: Tavily search `"<ref>" designer brand aesthetic influences`, top 5 results; Nemotron (`brand_proxies` agent, the `fast` route model is not wired per agent yet, so it uses the agents' default model) returns `{ proxies: string[] }` with 3 to 5 concrete named entities found in the text; each proxy goes through the direct path. Entities found this way carry `from: <reference>`. The Tavily result URLs are returned as sources. Attribution sits in the file header and in `THIRD_PARTY_NOTICES` of the PR body.
3. **No invention.** A reference with no Qloo match after both paths is `unresolved`. The LLM never writes an entity ID; IDs only come from Qloo.
4. **Errors.** Each failed call is logged with `evlog` at error level (`ONBOARDING_REFERENCE_FAILED`) with the reference and the provider, then the reference reads `unresolved` with `error: true`. The whole call fails only on bad input.
5. **Memory lines.** `writeBrandMemory(memory, userId, brand)` replaces the `- Voice:`, `- Palette and typography:` and `- Niches:` lines of the working memory and leaves every other line alone. It uses the same thread and resource as `recordTaste`.
6. **fal on wovain's key.** `falKeyCall(apiKey)` in `packages/core/src/fal.ts` returns a `ToolCall` that maps `submit_job`, `check_job` and `get_job_result` onto `@fal-ai/client`'s queue (`submit`, `status`, `result`), so `createArtist` is reused unchanged. `store_payload: false` on `submit_job` becomes fal's `X-Fal-Store-IO: 0` header, so the merchant's prompt stays out of fal's request history on wovain's key too. `flow/connections.ts` gains `platformFal(actor)` (flag on and `core.falKey` set) and `withArtistCall(actor, work)`; `requireFal` passes when the platform key applies. Credits were already charged per design (`charge(actor, "design")`), so metering needs no new code.
7. **Status endpoint never 404s.** `onboarding.status` answers `{ enabled: false }` when the flag is off, so the client can hide the fal card and the wizard link without a separate flag call. `resolveReferences` and `saveBrand` throw 404 when off.
8. **The server owns the entities.** `onboarding.saveBrand` takes no Qloo entities. It resolves `tasteReferences` itself and saves the entities that come back, so the profile's entities always match its references, even when the designer never pressed Resolve or changed a reference afterwards. The brand step also clears the shown results whenever a reference changes.
9. **Lookup cache and limit.** Each reference resolves through `taste_reference`, a cache shared by all merchants and keyed by the trimmed, lowercase reference. A row is reused for 30 days, or for 10 minutes when a provider failed on it. Only references the cache doesn't hold reach Qloo, Tavily and Nemotron, and each merchant starts at most 20 of those lookups an hour, counted from the cache rows they resolved (`resolved_by`, `resolved_at`). Over the limit, both procedures answer 429 before calling a provider. Pressing Resolve and then Save costs one lookup per reference. Onboarding isn't charged credits, so a new designer's first credits go to their first drop; the cache and the limit bound what it costs wovain.
10. **First run.** `onboarding.finish` sets `brand_profile.onboarded_at` when the designer reaches the done step, the first time only. While the flag is on and it is unset, `/dashboard` (where sign-up and sign-in land) redirects to the wizard. Every step can be skipped, so one pass through the wizard ends the redirect.
11. **UI.** A client wizard at `/[locale]/dashboard/onboarding` using the existing `wizard-parts` patterns and shadcn components (Field, Input, Badge, Item, RadioGroup, Progress). Steps live in the URL (`?step=`), so the OAuth return lands on the right step (`returnTo=/dashboard/onboarding?step=connect`).

## Risks / Trade-offs

- Qloo's hackathon server rate-limits: at most 5 references, each with at most 5 proxies, is 30 searches worst case for one set of new references. The cache and the hourly limit (decision 9) keep a looping caller from multiplying it. The limit counts rows before resolving, so two calls in flight at once can pass it by up to one set of references.
- `fal-key-next` must be set by the founder; until then the flag-on path falls back to the merchant connection (and the fal card stays visible), so nothing breaks.
- Changing the dev and next billing catalogs reprices those environments' Polar sandbox products on the next seed.

## Migration Plan

One migration (`pnpm run db:generate`): the `taste_reference` cache table and `brand_profile.onboarded_at`. Both are additive. Rollback is turning the flag off.
