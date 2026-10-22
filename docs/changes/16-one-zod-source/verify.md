# Verify: One zod source for the breakeven, quote, rule and artwork shapes

## Tests added

- `apps/server/test/unit/stored-records.test.ts` parses a design, an ad and a staged artwork record frozen in the shape saved before this change. Each must parse back unchanged: the quote, the ad's economics and rules, and the artwork fields.
- `test/unit/ad-concepts.test.ts` still parses an ad from before concepts.
- `test/unit/economics.test.ts` reads `breakevenPerSale` from the flat quote.

## Checks run

All pass: `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test` (374), `test:integration` (231), `test:stories` (53), `build`, `test:e2e` (10, plus the widget proof), after rebasing on the merchant dashboard merge.

Source lines (tests and docs aside): 127 added, 147 removed. About 50 of the added lines are the four stored schemas moving from `store.ts` into `packages/shared`.

## Review findings

- Self-review: `show_ad_widget` spreads `breakeven(...)` into the economics. That leaves `perSale` and `salesTax` in the object, and the store's `put` drops them when it parses with `adSchema`, so the stored ad has the same fields as before. `priceProduct` picks its four breakeven fields explicitly, so `quote_product` returns what it returned before.
- The optimizer files are untouched. They still call `breakeven(...).perSale`, `priceProduct(...).price` and `ruleThresholds(...)`.
- The `pr-review-toolkit` agents aren't installed in this session.

## Try it

In the review app, price a product (`quote_product`) and open an existing design and ad widget: the numbers match what they showed before.

## Departures from the plan

None. The issue proposed nesting breakeven in the quote and the ad. The intent explains why the stored shapes stay flat.
