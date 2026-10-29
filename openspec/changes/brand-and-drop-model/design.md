# Design

## Context

Current code:

- `brand_profile` (`packages/db/src/schema/autonomy.ts`) is one row per merchant (`userId` is unique). It holds `displayName`, `niches`, `tasteReferences`, `qlooEntities`, `demographics`, a free-text `voice` and up to 6 `palette` colours. There is no logo, no guardrail list, no palette lock, no preferred blanks and no price floor.
- `packages/core/src/brand-identity.ts` resolves taste references to Qloo entities (direct, or through cultural proxies) and writes the Voice, Palette and Niches lines into the taste memory the writers read.
- `packages/core/src/brand-discovery.ts` (#113) builds starter brands from Qloo audiences and holds palettes to the blank's real colours (3:1 ink contrast).
- #122 (`drop-style` flag, open) suggests 3 tones and up to 3 palettes per idea from the brand defaults and the idea's Qloo cues, saves the pick on the new `idea.style` jsonb column and passes the brand voice to the brief and ad writers as guardrails.
- `drop` holds `name`, `palette`, `qlooTags`, `styleFamily`, `brief` and `status`; `drop_item` holds `priceCents` per product. A drop has no link to a brand, no Experimental tag and no audience slice.
- Prices come from `packages/core/src/pricing.ts`: a cost-plus floor from the `PRICING_RULES` environment variable, the same for every merchant.
- `packages/core/src/autonomy.ts` (#60) has the levels `suggest` (R0 alone), `draft` (up to R1) and `publish_ads_paused` (up to R2), the closed action catalog and the policy. `approvals.ts` is the one queue, with an audit log, an `inverse` for undo and a `reverted` status. The `autopilot` flag lets autopilot make the calls a merchant would otherwise approve.

## What real brands and print-on-demand sellers do

The user asked whether a drop may target an audience outside the brand's core audience, and how real brands handle it. Findings:

1. **Drops and collabs widen reach, but the brand stays one identity.** Supreme releases small groups of products from the season's collection every week, and its collaborations are credited with widening its audience ([Wikipedia: Supreme](<https://en.wikipedia.org/wiki/Supreme_(brand)>)). Kith built its reach through collabs with Adidas, Nike, Timberland and others, and the press asks whether that many collabs dilute its aura ([FashionNetwork](https://hu.fashionnetwork.com/news/Could-Kith-wrestle-the-premium-streetwear-crown-from-Supreme-,898612.html)). In both cases the collab partner brings its own audience, and the drop stays under the parent's name.
2. **A durable new audience becomes a named sub-line, not a drop.** Kith opened Kith Women with a 60-piece collection and its own store ([Snobette](https://snobette.com/2015/12/kith-adds-a-womens-line-and-retail-space/)), then Kith Kids ([Complex](https://www.complex.com/style/a/erica-euse/kith-launches-kids)). Off-White's diffusion line "For All" was made so that "a new customer" could see themselves in the label ([Buro 24/7](https://buro247.me/?p=12035)). Buyers judge a diffusion line by design integrity, its own product brief and its own price structure ([Business of Fashion](https://www.businessoffashion.com/articles/news-analysis/diffusion-lines-still-make-sense/)).
3. **Fit decides whether an extension helps or hurts.** Aaker and Keller (1990) found that an extension carries the parent's positive associations only when the two fit. Loken and Roedder John (1993) found dilution when an extension is inconsistent with the brand's beliefs ([Wikipedia: Brand extension](https://en.wikipedia.org/wiki/Brand_extension), [MIT Sloan Review](https://sloanreview.mit.edu/article/brand-equity-dilution)).
4. **Print-on-demand practice: one brand with collections, a second shop only for a separate audience.** Guides say a second shop makes sense for audiences or categories that don't overlap, at the cost of a thinner marketing budget and more work; test a new niche with a pilot line in the current shop before opening another ([Printify](https://printify.com/blog/can-you-have-more-than-one-etsy-shop/), [eCommerce Fastlane](https://ecommercefastlane.com/running-multiple-etsy-shops-strategy-or-sprawl/)). For Shopify, one cohesive brand with collections earns more trust and scales better ([Gelato](https://www.gelato.com/au/blog/etsy-vs-shopify-for-print-on-demand), [Kittl](https://www.kittl.com/blogs/shopify-vs-etsy-pod/)). These are vendor blogs with a stake in the outcome.
5. **Fourthwall organises a shop by collections.** Creators group products "by theme, season, or style" in collections, which can be hidden ([Fourthwall help: create a collection](https://help.fourthwall.com/create-and-sell-products/how-to-guides/create-a-collection.md)). wovain already publishes each drop as a Fourthwall collection (`drop.collectionId`).
6. **Brand guidelines change on triggers, reviewed about once a year; creative is tested more often.** Refresh guidelines on real triggers, with a yearly review as the prompt ([Centric](https://www.centricdxb.com/insights/updating-brand-guidelines-refresh), [NoGood](https://nogood.io/2022/08/26/brand-guidelines)). Test execution (copy, imagery, layouts) often, from fatigue signals such as falling CTR and rising frequency ([Segwise](https://segwise.ai/blog/how-often-refresh-ad-creatives.md)), and keep logo and core identity out of A/B tests ([Shopify community](https://community.shopify.com/t/a-b-testing-brand-refresh/397414)).

The line between a new drop and a new brand: a drop changes the execution (tone, colours, products) for a moment or a slice of the same buyers; a new brand (or sub-line) is a different buyer that will come back, with its own name, brief and prices.

## Goals / Non-Goals

**Goals**

- One model for what a Brand owns and what a Drop may override.
- A rule, with evidence, for drops whose audience is outside the brand's.
- Brand updates learned from sales that follow the existing autonomy levels.
- The gaps between the current code and the model, as tasks.

**Non-Goals**

- App code, schema, migrations or UI in this change.
- A/B tests of the logo or the name: the research says to keep core identity out of A/B tests.
- Automatic creation of a new brand: wovain only proposes it.

## Decisions

### D1. The Brand owns the lasting identity

A Brand has: name and logo; niche and core Qloo audience (the Qloo entities and tags from the taste references, plus demographics); long-term taste references; voice as a personality plus a list of hard guardrails; a default palette with 1 or 2 anchor colours and an optional lock ("Always use my brand colours"); preferred blanks; a price floor and margin. A merchant may own more than one Brand, each with its own Fourthwall collections and Insights. Today's `brand_profile` becomes the merchant's first Brand.

### D2. A Drop inherits everything and overrides four things only

| Field | Drop may override? | Limit |
| --- | --- | --- |
| Tone | Yes | Never breaks a guardrail |
| Palette | Yes | Keeps at least one anchor colour; free when Experimental; none when the lock is on and the drop is regular |
| Audience slice | Yes | Overlaps the core audience, unless the audience rule (D4) allows otherwise |
| Products | Yes | 4 to 6 products, each priced at or above the price floor |
| Name, logo, guardrails, price floor, margin | Never |  |
| Taste references, preferred blanks | No (read-only defaults) | A drop may add Qloo cues to its audience slice |

#122's per-idea tone and palette become the drop's overrides. `drop-style` already treats the brand voice as guardrails and holds palettes to the blank; this model adds the anchor colour, the lock and the price floor.

### D3. Experimental drops

The merchant turns on "Try something new" for a drop. An Experimental drop may leave the brand palette (anchor colours not required, lock ignored only because the merchant asked for it on this drop) and may use the outside-audience rule (D4). It still keeps the guardrails, the name and the price floor. The drop is tagged `experimental`, and Insights reports it beside the brand's regular drops. Autopilot never starts an Experimental drop when the palette lock is on.

### D4. Audience outside the brand: Experimental or collab only, with a new-brand prompt

**Rule.** wovain measures how much a drop's audience slice overlaps the brand's core Qloo audience (shared Qloo tags and entities, weighted by affinity, 0 to 1).

- At or above the overlap threshold: any drop may target it.
- Below the threshold: only an Experimental drop or a collab drop may target it. Before saving, the merchant sees "This audience is far from your brand's buyers" with two choices: start a new brand for it, or run it as an experiment under this brand.
- A regular drop (not Experimental, not a collab) below the threshold is refused with that message.
- When 2 or more Experimental drops for the same outside audience outsell the brand's regular drops, wovain proposes a new brand for that audience (D5). It never moves the core audience toward it on its own.

**Why.** Real brands reach new audiences with drops and collabs (Supreme, Kith; finding 1), and the partner's audience is the bridge in a collab. When the new audience lasts, they make a named sub-line with its own brief and prices (Kith Women, Kith Kids, Off-White For All; finding 2). Extensions that don't fit the parent's beliefs dilute it (finding 3). POD guidance is to pilot a new niche inside the current shop first and open a separate shop only for an audience that doesn't overlap (finding 4). So: a far audience may be tested, labelled as a test, and graduates to its own brand when the sales say so.

The threshold starts at 0.3 and is configuration, set per environment like the other model settings.

### D5. Learning follows the autonomy levels

- **Evidence.** wovain compares each drop with the brand's regular drops on revenue per drop, sell-through and ad CTR from Insights. A brand update is proposed only from at least 2 drops and 30 orders (configuration) and never more than once a month per field. A guidelines review is also offered once a year, as the research suggests (finding 6).
- **What may change.** Default palette (not the anchor colours unless the merchant agrees), default tone, taste references, preferred blanks and the core audience's slices. A brand update never changes the guardrails, the name, the logo or the price floor: those change only when the merchant edits them.
- **Action.** A new catalog action `brand.profile.update`, risk R2: reversible, and it changes what customers see in later drops. Its payload holds the new values and its `inverse` the old ones.
- **Levels.** Under `suggest` and `draft` the policy answers `needs_approval`: the update waits in the approval queue with its evidence (for example "your experimental palette outsold the brand palette by 38% over 3 drops, 41 orders"). Under `publish_ads_paused` with the `autopilot` flag on (the user's "autopilot"), the policy allows it: wovain applies it, records it in the decision trace and offers undo, which reverts it with the `inverse` and sets the approval to `reverted`. Under `publish_ads_paused` without the `autopilot` flag, the update still waits for approval. While the agent is paused, it always waits.
- **New brand.** A new-brand proposal (D4) is a suggestion, never an action wovain runs on its own.

## Risks / Trade-offs

- Overlap from Qloo tags is an estimate. Mitigation: the threshold is configuration, and the merchant can always run the drop as an experiment.
- Small shops have few orders; evidence thresholds may rarely trigger. Mitigation: the yearly review still offers a refresh, and the thresholds are configuration.
- More than one brand per merchant touches every table keyed by `userId`. Mitigation: a nullable `brandId` first, filled with the first brand, then required.
- Some sources are vendor blogs or fashion press, not studies. The academic fit result (Aaker and Keller) carries the audience rule; the rest supports it.

## Open Questions

- Does a collab need its own type (a partner brand and its Qloo entity), or is it an Experimental drop with a partner field?
- Should a new brand get its own Fourthwall shop or a set of collections in the same shop? Fourthwall has one shop per account today.
