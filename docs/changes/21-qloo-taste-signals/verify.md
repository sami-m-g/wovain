# Verify: Qloo taste signals drive trend research and Meta targeting

## Owner decisions (2026-10-22)

1. **No Nemotron in idea ranking.** A code formula ranks themes from Tavily's per-result score and answer, recency, Qloo affinity and velocity, competitor saturation, IP safety and margin. The agent phrases the ideas through the design playbook. The ranking and copy prompts, their reply schemas, `models.trends`, `lib/taste.ts` and the `ranker` field are gone. Nebius stays only for `judge_design`.
2. **Tavily to the max.** Five SDK endpoints: `search` (news with answer and images; marketplace listings with domains and country; exact-match trademark), `extract`, `map`, `research` (polled with `getResearch`) and `crawl`. Every call sends `include_usage`, and a run stays under `research.maxCredits`.

## Tests added

- `apps/server/test/unit/trends.test.ts`:
  - The formula: weights add up to 1, the hype discount, the ad boost, saturation, the own-shop halving, margin, recency and median.
  - Without Qloo, the seed is the one theme. Each endpoint gets the options the spec names, and credits add up (3 for 2 searches and the extract).
  - With Qloo, themes are ranked in code, a theme that names a Qloo entity gets IP safety 0, and a re-run with `adCounts` makes no new Tavily calls and reports 0 credits.
  - The cap skips the niche brief when it doesn't fit.
  - The kept research is per merchant and per shaping setting: another merchant with the same seed, or a changed market, runs its own research.
  - The merchant's shop map demotes a matching theme, and script URLs are dropped.
  - A failed Qloo lookup, extract or brief degrades, and the seed never reaches the logs.
  - The brief is polled, parsed leniently and keeps http and https sources only.
  - The competitor crawl's options, clipping and URL filter.
  - Bounded inputs and http-only results.
- `apps/server/test/integration/research-tools.test.ts`: `get_niche_brief` answers only the merchant who started the brief. Every Tavily tool over MCP without a key, with a fake client, with an unbounded input (rejected before any call) and after a failure (user-safe, nothing logged). Also `research_trends` with Qloo, and `suggest_audience`.
- `apps/server/test/live/tavily.test.ts`: one real research capped at 10 credits (about 3), skipped without `TAVILY_API_KEY`. `test/live/qloo.test.ts` is unchanged.

## Checks run

All passed after rebasing on `main` (0.20.0), and again after the trim below:

- `pnpm check`
- `pnpm typecheck`
- `pnpm knip`
- `pnpm arch`
- `pnpm dupes` (0 clones)
- `pnpm test` (91 tests)
- `pnpm test:integration` (92 tests)
- `pnpm build`

`pnpm test:live` wasn't run: there are no keys in this worktree.

## Try it

1. Put `TAVILY_API_KEY` (and `QLOO_API_KEY` when it arrives) in `apps/server/.env`, then run `pnpm test:live`.
2. Run `pnpm dev` and ask the agent "what should I sell to synthwave fans?". The result shows ranked themes with score, signals, competitors, answer, references and `credits`, and a `briefId`. After you pick, the agent calls `get_niche_brief`.
3. Save your shop: "set my research shop URL to https://<shop>.fourthwall.com". The next research says `shop: "checked"` and marks themes you already sell.
4. In the ads step, the agent may call `scan_competitor_site` on a competitor listing before writing the copy.

## Departures from the plan

- `country` goes on the competitor search, not the news search: Tavily applies it to `topic: general` only.
- The shop URL is a setting (`research.shopUrl`), because Fourthwall connections don't store it and the connections code is out of scope here. The settings widget doesn't show the `research` group yet (widgets are out of scope); `update_settings` sets it.
- The brief's cost isn't known until it finishes, so the cap reserves 25 credits for it and `get_niche_brief` reports the real cost.
- The source grew, because the change adds two tools and four endpoints. The Nemotron path's deletions don't cover that.

## Trim

Lines added in `apps/server/src` and `packages/shared/src` against `main` (`git diff --numstat`):

|                 | Added | Removed |
| --------------- | ----- | ------- |
| Before the trim | 1,415 | 213     |
| After the trim  | 1,060 | 218     |

The target was 800. Same tools, endpoints, scoring, credit caps, cache and security behavior. What changed:

- `lib/market.ts` and `lib/niche-brief.ts` are folded into `lib/trends.ts`. The credit meter is gone: credits are summed from each Tavily reply's `usage`.
- The server's copies of shared shapes are gone. Result types come from `ReturnType` or `z.infer`. Qloo's demographics and heatmap schemas derive from the shared `audienceSchema`, and `research.shopUrl` reuses `webUrlSchema`.
- Tavily types and options come from `@tavily/core` (`TavilyClient`, `TavilySearchResponse["results"][number]`, the getResearch reply union) instead of a lenient re-declared reply schema.
- Competitor price, reviews and badges are read only from the extract's chunks, which Tavily reranks by the extract's `query`. The fallback that parsed prices out of search snippets is gone.
- The cache key is the merchant, the seed and the whole `research` settings group. Brief ownership (`saveBrief`, `ownsBrief`) is unchanged.
- Optional fields are set to `undefined` instead of spread conditionally. The tool handlers share one user-safe reply helper.

Not done:

- `scan_competitor_site` stays its own tool. As an option on `research_trends`, a scan in the ads step (usually more than 15 minutes after the research) would re-run the whole research for 10 to 35 credits instead of about 3.
- The last ~260 lines. Each of the five tools, four Qloo response shapes, the brief's output schema and the scoring signals is still needed, and the formatter wraps at 80 columns.
