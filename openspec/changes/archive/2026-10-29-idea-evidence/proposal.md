# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/194

## Why

Ideas reach the merchant from two pipelines with different fields: "what to sell now" (drop directions, #140, #174, #183) and the older trend research (`packages/core/src/trends.ts`). Cards change shape, so ideas can't be compared. The rank also misleads. `demand x Qloo fit / saturation` counts every running advertiser as demand, while listings count as supply, so a crowded theme scores twice. On next.wovain.com a "Saturated" idea (0.67, 17 of 20 near-identical listings) ranked above the only low-saturation one (0.56). Thin evidence can outrank proven ideas. Every idea of a run showed the same buyers, and titles were raw Qloo tags ("+children's").

Print-on-demand sellers judge a niche by demand against supply: "high demand + low listings = opportunity, high demand + high listings = saturated", and saturation means "sellers vastly exceeding demand" (seller guides on Etsy and print-on-demand niche research). Merch Informer's competition checker reads the share of listings that sell against the listing count. A low listing count means nothing "if the top sellers aren't actually selling" (SellerSprite).

## What Changes

Behind a new `idea-evidence-gate` flag (on in development and next, off in production):

- **One idea card contract** (`@wovain/core/idea-card`), the same for both pipelines and in the order of the fixed card: `make` (a readable title and concept, the products, the style), `why` (the Qloo tag and entities, the proof of demand, a sentence from the evidence and its citations), `audience` (ages, gender, places, interests, what they also like, and `scope`: the idea's own buyers or the brief's) and `competition` (`open`, `sweet-spot` or `crowded`, listings, advertisers, gaps, the median price). Each is `ok` or `unavailable` with a reason (`not_read`, `read_failed`, `not_connected`, `none_found`, `ungrounded`, `raw_tag`).
- **An evidence gate.** An idea is shown only with Qloo evidence, proof of demand and a competition read. The rest are dropped and recorded in the decision trace with the reason.
- **Sweet-spot competition.** Demand is shops running an ad for 14 days or more (twice at 30), bestseller badges and reviews (log scale). Supply is near-identical listings plus every shop advertising now. Audience cues no listing covers add a bonus of up to 30%. Both extremes are dropped: no proof of demand, and saturated (8 or more near-identical listings of 20, 15 or more advertisers of 50 ads, or demand under a quarter of supply).
- **An honest rank.** Kept ideas rank by the Wilson score lower bound of demand's share of the market signals (Evan Miller, "How Not To Sort By Average Rating"), x Qloo fit x the gap bonus. Thin evidence can't outrank a proven idea. No padding: fewer cards rather than weak ones.
- **Readable titles from a workflow step.** A new `name` step in the run workflow, and the same check for each direction, writes a title and a one-line concept per idea with a new `idea_words` agent. The agent writes from the evidence only. The grounding guard (`grounding.ts`) checks every number and claim, and a title that is only the raw tag is refused. Both are sent back once. On a second failure, a run's idea keeps its title unavailable with the reason, and a direction is dropped. Every attempt is recorded in the decision trace.
- **Who buys each idea.** An idea's audiences, places and brands are read from its own Qloo tag. Before, the brief's entities were mixed in, so every idea of a run got the same buyers. The age and gender come from the brief's entities and say so (`buyersScope: "brief"`). Audiences about money, jobs or politics ("Angel Start Up Investing", "Sales Professional") are left out.

## Capabilities

### New Capabilities

- `idea-evidence`: one idea card contract, the evidence gate, sweet-spot competition, the honest rank and checked titles.

### Modified Capabilities

- `drop-directions`: ranked by the sweet spot's lower bound behind the gate.
- `who-buys`: per-idea buyers with a scope.

## Impact

- `packages/core`: `idea-card.ts`, `sweet-spot.ts`, `idea-words.ts` (new); `drop-directions.ts`, `trends.ts`, `who-buys.ts`; the `idea_words` agent; the `idea-evidence-gate` flag.
- `packages/api`: `ideas.ts` (`listIdeas` returns `card`; `nameIdeas`), the run workflow's `name` step, `drop-directions.ts` (the gate, a `withdrawn` event and the cache key), `who-buys.ts` (scope).
- `apps/web`: the `IdeaCard` copy in en, es and fr; the directions stream drops a withdrawn card. The fixed card itself is built separately (story-ui).
- No migration: the new fields live in `idea.research` and `idea.who_buys` (jsonb).
