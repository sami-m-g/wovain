# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/181

## Why

The founder saw suggestions such as "High School Dancewear": raw Qloo tags with no printable concept and no proof that anyone buys them. A suggestion should stand on proof of demand.

## What Changes

- **Proof of demand** (`packages/core/src/demand.ts`):
  - The Meta Ad Library (`ads_library_search` through the merchant's Meta connection, when connected): shops running apparel ads on the theme now, and how many have kept them running 14+ days (validated) and 30+ days (evergreen).
  - Etsy, Amazon and Redbubble listings via Tavily: Bestseller badges and review counts.
  - A theme is proven by one shop advertising for 14+ days, one bestseller, or 50 reviews. Unproven themes are dropped and counted. The list is never padded.
- **Rank** = demand score x Qloo audience fit x how open the market is (saturation).
- **8 themes are checked** to keep up to 5 proven ones.
- **The model writes a concept**: the design idea (title), the buyer ("for …"), the occasion, the brief and "why now", from the proof only.
- **The card** shows the proof ("4 shops advertising it for 30+ days", "2 bestsellers on the marketplaces", reviews) and the buyer and occasion.
- The decision trace keeps every theme's proof, kept or dropped, with the ad and listing links as sources.

## Capabilities

### Modified Capabilities

- `drop-directions`: ranked on proof of demand.

## Impact

- `packages/core`: `demand.ts`, `drop-directions.ts`.
- `packages/api`: `flow/drop-directions.ts` opens the Meta session for the Ad Library.
- `apps/web`: the proof line, buyer and occasion on the card; en, es and fr copy.
