# Design

## Context

Trend research (`packages/core/src/trends.ts`) runs two Tavily searches per theme with `Promise.all`, so one rejected search rejects the step. Ideas are saved as `idea.research` (jsonb, `TrendIdea`), and designs carry `design.judgment` (jsonb). The foundation (PR #60) added the `tavily-evidence` flag and the `brand_profile` table with the merchant's Qloo entities and audience.

## Goals / Non-Goals

**Goals:** every evidence claim links to its pages; no single Tavily failure hides the rest; printed words are checked before a design is ready; no new tables.

**Non-Goals:** legal trademark clearance (a search is not a clearance); checking Meta ad copy claims (cut, see below); feeding reference images into the brief.

## Decisions

- **Settle each search.** `Promise.allSettled` per theme. A rejected search goes to `log.error` (PostHog Error Tracking) and the theme keeps the other search; `failedSearches` on the idea tells the UI. If every search for every theme failed, the first error is thrown so the step fails and its credits are released, rather than returning an empty list that reads as "no trends".
- **Prices from Extract.** The marketplace search already finds listing URLs. Extract reads up to 5 of them (Redbubble, TeePublic, Etsy) with `query` set to the price, so the most relevant chunks come first, and code takes the first price between $8 and $120 on each page. `failed_results` are data, counted in the wide event; the margin falls back to the snippet prices. An Extract call that throws is logged at error level and also falls back.
- **Dossier on demand, polled.** Tavily Research is asynchronous and takes about a minute on `mini`. Running it inside the run step for every theme would slow every run and spend credits merchants didn't ask for. Instead `ideas.startDossier` starts it once per idea (a failed one may restart) and saves `{ requestId, status: "pending" }` on `idea.research.dossier`; `ideas.dossier` reads it back from `GET /research/{id}` while pending and saves the result. After 15 minutes a pending dossier is marked failed and logged. The Qloo data goes in the request's `files` field as base64 JSON (`qloo-taste.json`); the SDK passes unknown options through as is.
- **Trademark check as a judge fact.** The design judge already treats some rules as facts that override the model. A new fact-only rule `trademark` joins them, so a failed check sends the design back through the existing redraw path, where the brief writer sees the failed note and changes the words. The check runs inside the judge's keyed `once` call, so a retried step reuses the saved result. It fails closed: a phrase whose search failed fails the check, and the merchant can still approve the flagged design after reading why. Only register pages whose title carries the whole phrase block; marketplace matches are a caution. Single words under 5 letters are not searched.
- **Citation UI.** Vercel AI Elements' `inline-citation` and `sources` are Radix components; `packages/ui` is Base UI. A small `Citations` component in `apps/web` follows their pattern (numbered sources, host names, external links) on the existing kit.

## Risks / Trade-offs

- Exact-match register search misses marks whose page titles differ from the phrase, and may flag a dead or unrelated registration. The UI says it is a search, not clearance, and links the record.
- Extract adds latency (one call per theme, in parallel) to research while the flag is on.
- A dossier costs Tavily credits that aren't charged to the merchant's wovain credits yet; one per idea limits it.

## Cut

- Checking ad claims against sources (Meta ad copy): needs a claim extractor and belongs with the media-buying workstream.
- Feeding Tavily's reference images into the brief and the design step: copyright risk, cut by the founder.
