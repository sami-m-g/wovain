# Intent: One zod source for the breakeven, quote, rule and artwork shapes

Issue: #16

## Problem

The breakeven, quote and rule shapes are declared twice, once as TypeScript interfaces and once as zod objects. Two hand mappers copy breakeven fields into the design quote and the ad's economics. The `stage_artwork` output repeats the staged artwork schema, and the stored schemas live in `store.ts` instead of `packages/shared`.

## Desired outcome

Each shape has one zod schema in `packages/shared`, and every type comes from `z.infer`. The breakeven mappers are gone, and the stored schemas sit in `packages/shared`.

## Constraints

- Firestore records have no migrations, so every saved design, ad, staged artwork, campaign, ad-media and brief record must still parse. A test parses fixtures in the old stored shape.
- The optimizer files (`packages/shared/src/optimizer/`, `apps/server/src/optimizer/`) are off limits. They call `breakeven(...).perSale`, `priceProduct(...).price` and `ruleThresholds(...)`, which keep working.
- The change removes more source lines than it adds.

## Open questions

The issue asked for a decision on stored records. Decision: the stored shapes stay as they are, flat breakeven fields included, so no saved document changes and no read needs a fallback. Nesting breakeven inside the quote and the ad, as the issue proposed, would need a legacy reader for every old record and changes to the design and ad widgets. That means more code for the same data.
