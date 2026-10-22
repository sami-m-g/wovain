# Plan: One zod source for the breakeven, quote, rule and artwork shapes

Spec: [spec.md](spec.md)

## Files that change

- `packages/shared/src/economics.ts`: `breakevenSchema`, `quoteSchema`; `priceProduct` returns the stored quote.
- `packages/shared/src/rules.ts`: `ruleThresholdsSchema`.
- `packages/shared/src/design.ts`: uses `quoteSchema`; gains `stagedArtworkSchema`.
- `packages/shared/src/ad.ts`: derived `economics` and `rules`; gains `adMediaSchema`.
- `packages/shared/src/campaign.ts`, `trends.ts`: the saved campaign and brief records.
- `apps/server/src/store.ts`: imports the stored schemas.
- `apps/server/src/tools/design.ts`, `ads.ts`: no mappers; `artworkOutput` derived.
- `apps/server/test/unit/stored-records.test.ts`: old-shape fixtures.
- `docs/spec.md`: record schemas come from `packages/shared`.

## Order of work

1. Turn the interfaces into schemas and derive the stored ones from them.
2. Drop the mappers and move the stored schemas.
3. Add the old-shape fixture test, then run every check.

## Risks

- An extra field reaching Firestore: `put` parses before it writes, and the fixture test pins the field lists.
- Optimizer callers: typecheck covers them.

## Tests that prove it

`stored-records.test.ts`, the existing economics and ad tests, and `pnpm check`, `typecheck`, `knip`, `arch`, `dupes`, `test`, `test:integration`, `test:stories`, `build` and `test:e2e`.
