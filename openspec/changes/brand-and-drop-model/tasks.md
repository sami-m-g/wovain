# Tasks

Gaps between the current code and the model (#133). This change builds nothing; items are checked as the code lands elsewhere (drop directions, #140 and #183).

## 1. Nothing requires a brand

- [x] 1.1 Make the onboarding brand step skippable ("Skip, just help me sell"); onboarding finishes without a brand (`onboarding-wizard.tsx`, `flow/onboarding.ts`)
- [ ] 1.2 Open gap: autopilot scans only merchants with a `brand_profile` row (`brandsToScan` in `flow/autopilot.ts`); scan merchants without one too
- [ ] 1.3 Ad targeting reads demographics from `brand_profile` (`flow/audience.ts`); use the drop's audience, from its Qloo cues when there is no brand
- [ ] 1.4 Check every other `brand_profile` read (`flow/drops.ts`, `flow/evidence.ts`, `flow/audiences.ts`, the writers' taste memory) works with no brand

## 2. Suggested drops (the default)

- [x] 2.1 Idea research needed a seed the merchant types (`ideas.research`, `trends.ts`). Add a seedless "what sells now" suggestion from Qloo trends, Tavily and the competition read, in any niche, ranked for expected sales
- [x] 2.2 With a brand set, seed the same research from the brand's niche, audience and references so suggestions stay within it
- [x] 2.3 Make suggested the default in the new-drop flow, with manual (today's seed) as the other choice

## 3. Optional brand and per-drop overrides

- [ ] 3.1 Add preferred blanks to the brand
- [ ] 3.2 `drop` has only `palette` and `qlooTags`. Add the drop's niche, audience, references, voice and blanks, filled from the brand when set, otherwise from the suggestion
- [ ] 3.3 #122 keeps the picked tone and palette on `idea.style` and starts from the brand. Move them to the drop's voice and palette, and start from the idea's Qloo cues alone when there is no brand
- [ ] 3.4 Let the merchant edit each drop field on that drop without changing the brand
- [ ] 3.5 Use the drop's fields (not the brand's) in `planDrop` and the brief and ad writers

## 4. Docs and checks

- [ ] 4.1 Update `docs/scope.md`, `docs/prd.md`, `docs/spec.md` and their docs-site copies when the model ships
- [ ] 4.2 Tests in `packages/core` and `packages/api`, including every flow with no brand; `pnpm run check`, `check-types`, `knip` and `spec:validate`
