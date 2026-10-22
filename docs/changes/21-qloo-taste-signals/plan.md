# Plan: Qloo taste signals drive trend research and Meta targeting

Spec: [spec.md](spec.md)

## Files that change

- `packages/shared/src/trends.ts`: result, brief and site schemas; signals; no model reply schemas.
- `packages/shared/src/settings.ts`: the `research` group.
- `apps/server/src/lib/qloo.ts` (new): the Qloo client, `tasteOf`, `audienceOf`.
- `apps/server/src/lib/tavily.ts`: the SDK surface wovain uses, the credit meter, `searchWeb` with answer and images.
- `apps/server/src/lib/trends.ts`: rewritten as one path (themes, budget, searches, cache).
- `apps/server/src/lib/market.ts`, `niche-brief.ts`, `score.ts` (new); `taste.ts` deleted.
- `apps/server/src/lib/ai.ts`: `models.trends` removed.
- `apps/server/src/tools/research.ts`: settings-aware `research_trends`, new `get_niche_brief`, `scan_competitor_site`, `suggest_audience`.
- `apps/server/src/server.ts`, `env.ts`: wiring.
- Playbooks: `design.ts` (the agent phrases ideas, polls the brief, offers to save the shop URL), `ads.ts` (optional competitor scan), `campaign.ts` (audience suggestion).
- Tests: `test/helpers.ts` (`fakeTavily` with every endpoint, `fakeQloo`), `test/unit/trends.test.ts`, `test/integration/research-tools.test.ts`, `test/live/tavily.test.ts`, `test/live/qloo.test.ts`.
- Docs: `README.md` (Tavily table, one line per endpoint), `docs/spec.md`, `AGENTS.md`, `docs/app-map.html`.

## Order of work

1. Shared schemas and the settings group.
2. Tavily wrapper and meter, score, market, niche brief.
3. Trend research on one path; delete the Nemotron ranking.
4. Tools, wiring, playbooks.
5. Tests, docs, checks.

## Risks

- Tavily Research's cost varies (4 to 110 credits): 25 are reserved and the real figure is reported.
- `country` doesn't apply to news search.
- Regex parsing of listing pages is brittle; it degrades to fewer signals.

## Tests that prove it

- Unit: the formula and its parts; every endpoint's options (`include_usage`, answer, images, domains, country, extract query, map paths, research model, crawl limits); credits add up; the cap skips the brief; own-shop matches halve the score; Qloo themes ranked and IP names lose; a re-run with `adCounts` makes no new calls; failures degrade without logging the seed; the brief parsed leniently with web links only; http and https only.
- Integration over MCP: each Tavily tool without a key, with a fake client, with bad inputs and after a failure; `research_trends` with Qloo; `suggest_audience`.
- Live (opt-in): one research capped at 10 credits.
