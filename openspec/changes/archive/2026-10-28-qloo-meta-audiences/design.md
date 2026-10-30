# Design

## Context

Meta's Ads MCP server stages wovain's campaigns. Its `ads_create_ad_set` takes a targeting spec and says: "Do NOT invent interest IDs". It has no tool that searches interests, so real IDs must come from Meta's Graph targeting search. Qloo's hackathon API answers `urn:demographics` for any entity. It scores `urn:audience` segments only against brands: an artist or a film gets the same flat baseline from every audience (tested 2026-10-28: Supreme and Patagonia differ by audience, Travis Scott and a Miyazaki film do not). Asking Qloo for an audience's top tags returns noise.

## Decisions

### Demographics to Meta ages and genders

Qloo's buckets map to Meta's years: `24_and_younger` 18-24, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, and `55_and_older` 55-65. The bucket with the highest positive mean affinity is the peak, and the range widens while the next bucket is also positive. When no bucket is positive, the ages stay broad. A gender is set only when one leads the other by 0.3 or more (Meta codes 1 men, 2 women).

Ages, genders and interests go to Meta as Advantage+ audience suggestions, which Meta's MCP keeps on. Under Advantage+ audience, `age_min` stays a hard minimum only up to 25, so wovain caps it at 25 and keeps Qloo's real range in the evidence. Countries stay the hard control.

### Audiences scored against the brand's brands

Each of the 27 catalog audiences is scored with `filter.type=urn:entity:brand`, `filter.results.entities=<brand IDs>` and `signal.demographics.audiences=<audience>` (6 at a time). Each audience's lift is its mean affinity minus the average across all audiences. Up to 3 audiences with a lift of 0.02 or more are kept. A flat answer keeps none, which is honest. When the brand profile has no Qloo brand, its taste references and niches are resolved to Qloo brands first.

Alternative considered: an LLM picks audiences from the list. Rejected: it adds a guess where Qloo can measure.

### Interests from Meta's targeting search

wovain searches Meta's interests with each kept audience's Meta wording ("Sneakerheads" is searched as "Sneakers") and with the names of up to 5 brand entities. A result counts only when Meta names it like the query, as an exact name or whole words contained either way. Each match is kept with the Qloo ID it came from, the query, the Meta ID, name, path and audience size. Queries with no match are kept as unmatched. The search uses wovain's app access token (`META_APP_ID|META_APP_SECRET`) on `META_GRAPH_URL`, so it needs no merchant grant.

### Failures

Each step (demographics, audiences, interests) that fails is logged at error level through evlog, recorded as failed in the trace and evidence, and left out. The ad set then targets with what is known; at worst it targets countries only, as before. Nothing is guessed.

### Durable staging

`createProductCampaign` keeps the targeting with the staging's key (`once`), like the ad copy, so a retried staging sends the same ad set. An ad set with Qloo targeting is named `… · qloo · …`; one without is still named `… · broad · …`.

## Risks

- Meta may refuse the app token for interest search. The step then fails visibly, and the ad set keeps Qloo's ages and genders without interests. If that happens, the fix is a system-user token or the merchant's own token. The live call was not tested here (no Meta app credentials locally).
- Qloo's audience scores for brands are only relative, so the lift threshold is a judgment call. Tune it with real brands.
