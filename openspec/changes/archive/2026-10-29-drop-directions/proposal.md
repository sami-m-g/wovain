# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/129 (and the "what sells now" and skippable brand step gaps in #134)

## Why

The new-drop step opens on an empty text box, so a merchant has to know what to sell before wovain helps. The product model (#133, #134) says "just sell" is the default and the brand is optional: wovain should suggest what will sell now from trends, with no brand and no typed seed, and stay within the brand only when the merchant has one.

## What Changes

Behind a new `drop-directions` flag (on in development and next, off in production), the new-drop step opens with 3 to 5 directions to sell now above the free-text brief:

- **No brand needed ("just sell").** Each direction grows from one Qloo audience an apparel shop can sell to (the brand-discovery engine's list, a new set per merchant and per "Show me others"): Qloo insights with `bias.trends=high` find what is rising among its fans, and the genre tag those entities share is the direction. The niches change from one set to the next.
- **Within the brand when there is one.** With a saved brand, Qloo finds what is rising among the fans of the brand's references (with its strongest age bucket and gender) and the tags those entities carry; a tag that only restates the niche is left out. "Ignore my brand this time" switches to the audience directions for this drop.
- **Ranked by sales potential.** Tavily momentum (news in the past month) and saturation (near-identical marketplace listings) from the brand-discovery engine; code ranks by Qloo affinity x momentum x low saturation.
- **Code ranks, the model writes.** Nemotron (a new `drop_directions` agent, default job, one Zod-checked call) writes only a title, the brief and a "why now" line from the facts given; plain words from the facts when it fails.
- **One-click cards.** Title, why now, the audience, the rising Qloo entities, news links and the similar-listings count. One click starts the drop with that brief. The free-text box stays.
- **Qloo decides.** A Qloo failure shows a retry; never directions made without Qloo. The `trends-qloo` kill switch refuses them (`QLOO_OFF`), as it refuses runs.
- **The brand step says it is optional.** Its title reads "Your brand (optional)" and its skip button "Skip, just help me sell" (en, es, fr). Skipping already finishes onboarding.
- Free, each merchant at most 20 requests an hour; every request saved in the decision trace (agent `drop_directions`).

## Capabilities

### New Capabilities

- `drop-directions`: what to sell now in the new-drop step, with or without a brand.

## Impact

- `packages/core`: `drop-directions.ts`; `brand-discovery.ts` exports `momentumOf`; a `drop_directions` agent; the `drop-directions` flag.
- `packages/api`: `runs.directions` (`ignoreBrand`, `round`); `flow/brand-discovery.ts` exports `localeOf` and `traced`.
- `apps/web`: `drop-directions.tsx` in the brief step; the brand step's title and skip copy; en, es and fr.
- No migration.
