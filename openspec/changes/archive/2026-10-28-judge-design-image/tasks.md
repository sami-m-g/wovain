## 1. Vision check

- [x] 1.1 Add the `design_vision` agent on `nvidia/Nemotron-3.5-Super-VL` with https image URLs passed through
- [x] 1.2 Let `ask` send image URLs as image parts
- [x] 1.3 Add `inspectArtwork` and its schema: garment, background, printed text, per-color contrast
- [x] 1.4 Merge vision facts into the judgment and drop colors the art disappears on

## 2. Brief check

- [x] 2.1 Add the `garment` rule to the brief judge and the brief writer
- [x] 2.2 Add the garment rule to the `design_quality` judge's definitions

## 3. Redraw and flag

- [x] 3.1 Redraw a `revise` design once from the judge's fixes, uncharged and idempotent
- [x] 3.2 Flag a `revise` design on its card and label approve "Approve anyway"

## 4. Evals and tests

- [x] 4.1 Add the pink-tee case as a labeled `design_quality` fail
- [x] 4.2 Unit tests: garment fails, dark art drops dark colors, no color left fails, text mismatch fails
- [x] 4.3 Run check, check-types, knip, spec:validate and tests
