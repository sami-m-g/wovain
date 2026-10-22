# Verify: Remove hand-rolled code from trend research and the Genkit telemetry filter

## Tests added

- `apps/server/test/unit/trends.test.ts`, "results go to the model numbered from 1, and citation 1 links the first": failed first on the old code (the prompt carried `"n":0`), passes after the fix.
- Same file: the relevance fallback returns the highest-scoring results in order, one source each, with each URL once; a model failure falls back to relevance; the trademark screen and the http/https filter go through a fake `Pick<TavilyClient, "search">` (`fakeTavily` and `searchResult` in `test/helpers.ts`).
- `apps/server/test/unit/telemetry.test.ts`: a real Genkit call through `GenkitSpanFilter`. An unfiltered exporter shows Genkit did trace under `genkit-tracer`, and the filtered one keeps only the `mcp.request` span. If a Genkit upgrade renames its tracer, this test fails.
- `apps/server/test/integration/research-tools.test.ts`: `research_trends` over MCP returns ideas in relevance order with the untrusted note.

## Checks run

All pass: `pnpm check`, `pnpm typecheck`, `pnpm knip`, `pnpm arch`, `pnpm dupes` (0 clones), `pnpm test` (84 tests), `pnpm test:integration` (51 tests), `pnpm build`. `pnpm test:live` wasn't run (it spends Tavily credits).

## Review findings

`/simplify` (reuse, simplification, efficiency and altitude reviewers):

- Fixed: `screen` rebuilt `{ title, url }` by hand; it now uses `sourceOf`, so trademark hits keep their date like idea sources.
- Fixed: the default count was applied in two places; `research` now resolves it once.
- Fixed: the `ranker` union repeated the zod enum; it's `TrendRanker`, inferred from the schema.
- Fixed: `searchClientFor` only wrapped a key check that `trendResearchFor` repeated; `trendResearchFor` builds the client itself.
- Skipped: an allowlist of exported scopes instead of dropping `genkit-tracer`. That's a broader policy than the issue asks for; the telemetry test catches a renamed tracer.
- Skipped: a union on `ranker` so Nemotron ideas keep `angle` and `why` required. More schema for no consumer that needs it; the playbook and tool description say both are optional.
- Skipped: Tavily's scores from two queries aren't strictly comparable. Both are relevance in 0 to 1, and Nemotron still reads every result; the fallback is a best effort.
- Skipped: Genkit still serializes payloads onto spans before they're dropped (unchanged from before, and Genkit has no switch), and `screen` clips snippets it then discards (trivial).

The `pr-review-toolkit` agents (`code-simplifier`, `silent-failure-hunter`) aren't installed in this session, so they didn't run. The only `catch` in the change is the existing model fallback, which logs the error class and returns ideas.

## Try it

In the review app, call `research_trends` with a seed such as "pickleball". With `NEBIUS_API_KEY` set, ideas carry an angle and why, and their sources are the results Nemotron cited. Without it, `ranker` is `"tavily"` and each idea is one headline with its link. Every result keeps the untrusted `note`.

## Departures from the plan

- `searchClientFor` from the spec was folded into `trendResearchFor` after review.
- `TavilySearchResult` isn't exported by `@tavily/core` 0.7.14, so the result type is `TavilySearchResponse["results"][number]`.
