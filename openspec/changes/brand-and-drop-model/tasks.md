# Tasks

Gaps between the current code and the model (#133). Nothing here is built in this change.

## 1. Brand defaults (`brand_profile`, `brand-identity.ts`, `brand-discovery.ts`)

- [ ] 1.1 Add preferred blanks to the brand; brand discovery's blank today is a stated stand-in, not a saved choice
- [ ] 1.2 Add a price floor and margin to the brand; today they are global (`PRICING_RULES` in `pricing.ts`) and can only be raised per brand
- [ ] 1.3 Save the audience as one object: `qlooEntities` and `demographics` are separate fields and the Qloo tags are not saved

## 2. Starting a drop

- [ ] 2.1 Manual: today's seed (`ideas.research`) is the direction; name it as such in the new-drop flow
- [ ] 2.2 Suggested: no flow proposes a direction from the brand alone. Seed the Qloo and Tavily research (`trends.ts`) from the brand's niche, audience and references, and show the directions to pick from

## 3. Drop fields from the brand, with overrides

- [ ] 3.1 `drop` has only `palette` and `qlooTags`. Add the drop's own audience, references, voice, preferred blanks, and price floor and margin, copied from the brand when the drop is created
- [ ] 3.2 #122 keeps the picked tone and palette on `idea.style`, not on the drop. Move them to the drop's voice and palette fields
- [ ] 3.3 Let the merchant edit each field on the drop without changing the brand
- [ ] 3.4 Use the drop's fields (not the brand's) in `planDrop`, the brief and ad writers and pricing; hold the drop's price floor at or above the global floor

## 4. Docs and checks

- [ ] 4.1 Update `docs/scope.md`, `docs/prd.md`, `docs/spec.md` and their docs-site copies when the model ships
- [ ] 4.2 Tests in `packages/core` and `packages/api`; `pnpm run check`, `check-types`, `knip` and `spec:validate`
