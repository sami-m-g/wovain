# Design

## Context

Current code:

- `brand_profile` (`packages/db/src/schema/autonomy.ts`) is one row per merchant (`userId` is unique). It holds `displayName`, `niches`, `tasteReferences`, `qlooEntities`, `demographics`, a free-text `voice` and up to 6 `palette` colours. It has no preferred blanks and no price floor or margin.
- `packages/core/src/brand-identity.ts` resolves taste references to Qloo entities (direct, or through cultural proxies) and writes the Voice, Palette and Niches lines into the taste memory the writers read.
- `packages/core/src/brand-discovery.ts` (#113) builds starter brands from Qloo audiences and holds palettes to the blank's real colours (3:1 ink contrast).
- #122 (`drop-style` flag, open) suggests 3 tones and up to 3 palettes per idea from the brand defaults and the idea's Qloo cues, saves the pick on the new `idea.style` jsonb column and passes the brand voice to the brief and ad writers as guardrails.
- Ideas start from a seed the merchant types (`ideas.research`): Qloo names the themes and Tavily adds the evidence (`packages/core/src/trends.ts`). `planDrop` (`packages/mastra/src/mastra/flow/drops.ts`) turns an idea into a 4 to 6 product capsule.
- `drop` holds `name`, `palette`, `qlooTags`, `styleFamily`, `brief` and `status`; `drop_item` holds `priceCents` per product. A drop has no audience, voice, blanks or price fields of its own.
- Prices come from `packages/core/src/pricing.ts`: a cost-plus floor from the `PRICING_RULES` environment variable, the same for every merchant.

## Background: what real brands and print-on-demand sellers do

Research done for this change (#133). The simpler model below ("Just sell" by default, an optional brand) was chosen for now; experimental drops, an audience-overlap rule, a new-brand prompt, anchor colours with a palette lock and brand updates learned from sales may come later, and these findings are kept for that.

1. **Drops and collabs widen reach, but the brand stays one identity.** Supreme releases small groups of products from the season's collection every week, and its collaborations are credited with widening its audience ([Wikipedia: Supreme](<https://en.wikipedia.org/wiki/Supreme_(brand)>)). Kith built its reach through collabs with Adidas, Nike, Timberland and others, and the press asks whether that many collabs dilute its aura ([FashionNetwork](https://hu.fashionnetwork.com/news/Could-Kith-wrestle-the-premium-streetwear-crown-from-Supreme-,898612.html)). In both cases the collab partner brings its own audience, and the drop stays under the parent's name.
2. **A durable new audience becomes a named sub-line, not a drop.** Kith opened Kith Women with a 60-piece collection and its own store ([Snobette](https://snobette.com/2015/12/kith-adds-a-womens-line-and-retail-space/)), then Kith Kids ([Complex](https://www.complex.com/style/a/erica-euse/kith-launches-kids)). Off-White's diffusion line "For All" was made so that "a new customer" could see themselves in the label ([Buro 24/7](https://buro247.me/?p=12035)). Buyers judge a diffusion line by design integrity, its own product brief and its own price structure ([Business of Fashion](https://www.businessoffashion.com/articles/news-analysis/diffusion-lines-still-make-sense/)).
3. **Fit decides whether an extension helps or hurts.** Aaker and Keller (1990) found that an extension carries the parent's positive associations only when the two fit. Loken and Roedder John (1993) found dilution when an extension is inconsistent with the brand's beliefs ([Wikipedia: Brand extension](https://en.wikipedia.org/wiki/Brand_extension), [MIT Sloan Review](https://sloanreview.mit.edu/article/brand-equity-dilution)).
4. **Print-on-demand practice: one brand with collections, a second shop only for a separate audience.** Guides say a second shop makes sense for audiences or categories that don't overlap, at the cost of a thinner marketing budget and more work; test a new niche with a pilot line in the current shop before opening another ([Printify](https://printify.com/blog/can-you-have-more-than-one-etsy-shop/), [eCommerce Fastlane](https://ecommercefastlane.com/running-multiple-etsy-shops-strategy-or-sprawl/)). For Shopify, one cohesive brand with collections earns more trust and scales better ([Gelato](https://www.gelato.com/au/blog/etsy-vs-shopify-for-print-on-demand), [Kittl](https://www.kittl.com/blogs/shopify-vs-etsy-pod/)). These are vendor blogs with a stake in the outcome.
5. **Fourthwall organises a shop by collections.** Creators group products "by theme, season, or style" in collections, which can be hidden ([Fourthwall help: create a collection](https://help.fourthwall.com/create-and-sell-products/how-to-guides/create-a-collection.md)). wovain already publishes each drop as a Fourthwall collection (`drop.collectionId`).
6. **Brand guidelines change on triggers, reviewed about once a year; creative is tested more often.** Refresh guidelines on real triggers, with a yearly review as the prompt ([Centric](https://www.centricdxb.com/insights/updating-brand-guidelines-refresh), [NoGood](https://nogood.io/2022/08/26/brand-guidelines)). Test execution (copy, imagery, layouts) often, from fatigue signals such as falling CTR and rising frequency ([Segwise](https://segwise.ai/blog/how-often-refresh-ad-creatives.md)), and keep logo and core identity out of A/B tests ([Shopify community](https://community.shopify.com/t/a-b-testing-brand-refresh/397414)).

The line between a new drop and a new brand: a drop changes the execution (tone, colours, products) for a moment or a slice of the same buyers; a new brand (or sub-line) is a different buyer that will come back, with its own name, brief and prices.

## Goals / Non-Goals

**Goals**

- "Just sell" as the default: no brand needed, wovain suggests what will sell now.
- An optional brand that keeps suggestions within it and gives each drop its defaults.
- Two ways a drop starts: suggested (the default) or manual.
- Nothing requires a brand.
- The gaps between the current code and this model, as tasks.

**Non-Goals**

- App code, schema, migrations or UI in this change.
- Experimental drops, collabs, an audience-overlap rule, a new-brand prompt, anchor colours or a palette lock, and learning brand updates from sales (may come later; see Background).
- More than one brand per merchant.
- A brand price floor: prices stay the global cost-plus floor from `PRICING_RULES`.

## Decisions

### D1. "Just sell" is the default

The user's goal is to make money, simply. A merchant without a brand gets drops suggested from what will sell now: Qloo trends, Tavily evidence and the competition read, in any niche, possibly a different one every drop. Suggestions are ranked for expected sales (Qloo affinity, Tavily momentum, low saturation), the factors brand discovery already ranks by. Nothing in onboarding, drops, autopilot or ads may require a brand.

### D2. The brand is optional

A merchant who wants a concrete brand rather than just selling sets one: niche, audience (Qloo entities, tags and demographics), references, voice, palette and preferred blanks. With a brand set, suggestions stay within its niche and audience, and each drop's fields start from the brand's values. Today's `brand_profile` row is the brand; it gains preferred blanks.

### D3. A drop is suggested or manual

- **Suggested (default).** wovain proposes directions: from trends alone without a brand, or from trends within the brand when one is set. The merchant picks one or asks again.
- **Manual.** The merchant gives the direction in their own words (today's seed). Qloo and Tavily research it as they do now.

Either way the drop then follows today's flow: idea, `planDrop`, capsule, approval, publish.

### D4. Any field can be overridden per drop

The merchant can change any drop field (niche, audience, references, voice, palette, blanks) on that drop only; the brand stays unchanged. Without a brand, wovain fills the fields from the suggestion itself (#122's per-idea tone and palette from the idea's Qloo cues). With a brand, #122 starts from the brand defaults as it does now.

Rationale: print-on-demand sellers test niches and keep one shop with collections (findings 4 and 5); a concrete brand is a choice the merchant makes when they want buyers who come back (finding 2).

## Risks / Trade-offs

- "Just sell" drops in unrelated niches can make a shop look incoherent, which finding 4 says costs trust. Accepted for now: the merchant chose sales over identity, and each drop is its own Fourthwall collection.
- A drop can override the audience far from the brand's buyers with no warning. Finding 3 says fit matters, so an overlap check is a candidate to add later.
- Copying the defaults onto each drop means a later brand edit does not change drops already made. Intended: a published drop keeps what it was made with.
