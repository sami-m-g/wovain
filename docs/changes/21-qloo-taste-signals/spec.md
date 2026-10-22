# Spec: Qloo taste signals drive trend research and Meta targeting

Intent: [intent.md](intent.md)

Two owner decisions on 2026-10-22 changed the intent's plan. No model ranks ideas or writes their copy: code ranks, and the host agent (ChatGPT, through the design playbook) phrases the ideas. Tavily is used to the full, for the "Best Use of Tavily" prize.

## Requirements

1. Without `QLOO_API_KEY`, the seed is `research_trends`' one theme and the result says `qloo: "not_configured"`.
2. With the key, `research_trends` calls Qloo `/search` (the seed, 3 results), `/v2/insights` (`filter.type=urn:tag`, 10 tags) and `/v2/trending` (the first entity, 28 days) on `https://hackathon.api.qloo.com` with `X-Api-Key`. The 3 tags with the highest affinity are the themes. If Qloo fails or matches nothing, the seed is the theme and the result says `"failed"` or `"no_match"`.
3. Per theme, two basic Tavily searches:
   - Timing hooks: `topic: news`, `time_range: week`, 5 results, `include_answer: "advanced"`, `include_images` and `include_image_descriptions`.
   - Competitor scan: `include_domains` etsy.com, redbubble.com, fourthwall.com, `time_range: year`, `country` from `research.market`, 10 results.
4. Per run, optional steps in priority order, each only while its worst case fits under `research.maxCredits` (default 50) after the searches:
   1. Cited niche brief: Tavily `research`, model `mini`, `output_schema` (audience, price band, angles, risks, sources), `output_length: short`. 25 credits are reserved. `research_trends` returns its `briefId` without waiting, and `get_niche_brief` polls it.
   2. One `extract` with a `query` over the top 3 listings per theme: price, review count, best-seller badge, "officially licensed".
   3. One `map` of `research.shopUrl` (`/products/` pages, 40 at most), when it's set.
5. Every Tavily call sends `include_usage`. The result returns `credits: { used, cap }`; `get_niche_brief` returns the brief's own cost.
6. Each theme's score is computed in code from exported weights (`SCORE_WEIGHTS`) and returned with every input (`signals`). Themes are sorted by score.
7. Each idea carries `theme`, `score`, `signals`, `sources`, up to 3 `competitors` (price, reviews, best seller), `moment`, Tavily's `answer`, up to 4 `references` (mood-board images), and with Qloo `taste` and `tags`. `ownProducts` lists the merchant's matching products. `avoidNames` lists the Qloo entity names.
8. A re-run with the same seed within 15 minutes (with `adCounts` from the agent's Ad Library search) re-scores the kept searches and reports 0 credits.
9. `scan_competitor_site` crawls a competitor URL (`crawl`, depth 1, 5 pages, with instructions) and returns clipped excerpts, for the ads playbook. `tools/ads.ts` is unchanged.
10. `suggest_audience` and `screen_trademark` work as before.
11. Security: every Tavily text is marked untrusted in each tool's note; only http and https URLs come through (results, images, map, crawl, brief sources); inputs are bounded (seed, `adCounts`, brief ID, competitor URL); nothing about queries or results is logged, only error classes.

## Design

### The score

All parts are clamped to 0..1:

- demand = Qloo affinity (0.5 without Qloo); with `activeAds`, 0.7 × that + 0.3 × min(activeAds / 20, 1)
- momentum = min(newsHits / 5, 1) × confirmation, where confirmation is 1 when Qloo's velocity is above 0, 0.5 at 0 or below and 0.75 without one
- relevance = the mean Tavily `score` of the theme's results
- recency = the mean of 1 − age / 7 days over the dated headlines
- openness = 1 − (0.6 × marketHits / 10 + 0.4 × bestSellers / 3)
- margin = 0.5 + (competitor median price − price floor) / price floor, where the floor is `priceProduct` on `research.baseCost` ($12) with the merchant's pricing and economics; 0.5 without prices
- IP safety = 0 when the theme names a Qloo entity, 0.5 when a top listing says it's officially licensed, else 1

score = 0.25 demand + 0.2 momentum + 0.1 relevance + 0.1 recency + 0.15 openness + 0.1 margin + 0.1 IP safety, halved when the merchant's shop already has a product whose path shares a word with the theme.

### Who writes what

Code ranks. The design playbook tells the agent to keep that order and write one idea (angle, why now) per theme from its answer, moment and sources, or up to 3 from a single theme. It skips names in `avoidNames`, rewords ideas that duplicate `ownProducts`, describes `references` in its own words, and polls `get_niche_brief` after the merchant picks. Nebius stays only for `judge_design`, and later the autopilot and optimizer.

### Credits

| Step                  | Credits                |
| --------------------- | ---------------------- |
| 6 searches (3 themes) | 6                      |
| Extract, 9 URLs basic | 2                      |
| Map, 40 pages         | up to 4                |
| Research, mini        | 4 to 110 (25 reserved) |

A full run with Qloo: about 37 reserved, 35 to 50 typical. Tavily prices the brief only when it finishes, so the cap uses the reserve and `get_niche_brief` reports the real figure. `scan_competitor_site` is separate, about 3 credits.

### Code

- `lib/tavily.ts`: `TavilyApi` (the SDK's search, extract, map, crawl, research and getResearch), the credit meter, `searchWeb`.
- `lib/trends.ts`: themes, the budget, the searches, the cache and the result.
- `lib/market.ts`: the listings extract, the shop map, competitor parsing, IP safety and the competitor crawl.
- `lib/niche-brief.ts`: the brief's schema, start and poll.
- `lib/score.ts`: `SCORE_WEIGHTS`, `scoreIdea`, margin, recency, median.
- `tools/research.ts`: `research_trends` (reads settings), `get_niche_brief`, `scan_competitor_site`, `suggest_audience`, `screen_trademark`.
- `packages/shared`: the result schemas, and the `research` settings group (`maxCredits`, `market`, `baseCost`, `shopUrl`).
- Deleted: `lib/taste.ts`, the Nemotron ranking and copy prompts, `trendReplySchema`, `tasteReplySchema`, `models.trends`, the `ranker` field.

### Libraries checked

- `@tavily/core` 0.7.14 covers every endpoint. `research()` has no `output_length` option, so it's passed through as `output_length` (the SDK forwards unknown keys). `getResearch()` returns Tavily's raw reply, so it's parsed leniently.
- `@qloo/qloo-harness` doesn't export a client, so Qloo stays on `fetchJson`.

## Areas of concern

- **Country on news.** Tavily applies `country` only to `topic: general`, so the competitor search carries it and the timing-hook search doesn't (docs.tavily.com, search endpoint).
- **Shop URL.** Fourthwall connections don't store the shop's URL, and the connections code is out of scope, so it's a setting. The playbook offers to save it from `ecommerce_get-current-shop`. The settings widget doesn't show the new group yet: widgets are out of scope.
- **Brief IDs.** `get_niche_brief` polls any Tavily request ID it's given. IDs are unguessable and the brief holds only public web research.
- **Unverified until the Qloo key arrives:** the hackathon host accepting the key and Qloo's field names. The schemas are lenient.
- **Page text.** Prices, reviews and badges are read with regular expressions from the first 4,000 characters of each listing; a page in another layout yields fewer signals, not errors.
