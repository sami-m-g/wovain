# Proposal

Issues: #62 (https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/issues/62), #64 (https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/issues/64).

## Why

In production on 2026-10-26 (about 20:10 UTC, a Halloween tee brief), research returned one idea titled with the brief, and its sources were off-topic, such as "Archive for March 2011 – SlashFilm".

- **One idea, titled with the brief (#62):** when Qloo matched nothing, failed, or was off (paid plans), `createTrends` used the seed as the only theme. One theme gives one idea, and the idea's title is the theme.
- **Weak sources (#64):** Tavily searched the whole brief as a news query, then code kept every result with a web URL. Archive and tag pages, stale or low-relevance results, and duplicates were all kept. When the news search found nothing, marketplace listings became the sources.

## What Changes

- Research always studies 3 to 5 distinct themes. Qloo's themes come first. When Qloo names fewer than 3, a new `research_themes` agent (Nemotron) splits the brief into themes, each with a search query. Without a model, or when it fails, design angles on the brief's subject stand in. The failure is logged at error level and the run continues.
- A theme is never the brief, and reworded duplicates are dropped. The model's text has no length cap: long names are clipped in code.
- Tavily searches each theme's query instead of the brief. News searches use `topic: "news"`, `timeRange: "month"` and `searchDepth: "advanced"`. Code keeps a result only when it is a web page that is not an archive or tag page, is at most 31 days old, has a Tavily score of at least 0.4, and shares a word with the theme's query. Results are then deduped by page and by headline and ranked by relevance and freshness.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-generation`: distinct research themes, and filtered, ranked sources.

## Impact

`packages/core` (`themes.ts`, `trends.ts`, a new `research_themes` agent and its scorers) and the Tavily integration docs.
