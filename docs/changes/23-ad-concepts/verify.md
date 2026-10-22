# Verify: distinct Meta ad concepts per product

## Tests added

- `apps/server/test/unit/ad-concepts.test.ts`: product status follows its concepts; a merge revises only the named concept and appends new ones; a stored ad from before concepts reads as one concept.
- `apps/server/test/unit/fal-media.test.ts`: job handles are read from a `submit_jobs` reply (structured or JSON text); media URLs are https `fal.media` only, once each.
- `apps/server/test/integration/ad-tools.test.ts`: the breakeven numbers are unchanged; `record_ad` decides one concept and the product is added once all are decided; feedback revises one concept and keeps the other's approval; visuals from another host are refused; **fal media wovain didn't collect for the design is refused** (security review); `add_video_audio` refuses uncollected clips; a carousel needs live designs; `generate_ad_images` sends the chosen mockup and the artwork as references.
- `apps/server/test/integration/campaign-tools.test.ts`: `campaign_plan` lists only approved concepts (`wovain d1 · c1`), with `aiMade`; the widget counts approved concepts.
- `apps/widgets/src/ad/ad-widget-view.stories.tsx`: Draft, Draft Dark, Approves One, Skips One, Sends Feedback, Revised, Visual Failed, Ready For Campaign, Ready For Campaign Dark, Watches Full Screen, Approve Fails (each with the a11y check).

## Checks run

| Command | Result |
| --- | --- |
| `pnpm check` | Pass |
| `pnpm typecheck` | Pass (after `pnpm infra:install` in this worktree) |
| `pnpm knip` | Pass |
| `pnpm arch` | Pass |
| `pnpm dupes` | Pass, 0 clones |
| `pnpm test` (unit) | 13 files, 91 tests pass |
| `pnpm test:integration` (emulators) | 12 files, 86 tests pass |
| `pnpm build` | Pass |
| `pnpm test:stories` | 4 files, 36 stories pass |

## Review findings

- **Security review (coordinator)**, MEDIUM: any `fal.media` URL passed the visual check. Fixed: wovain stores the job handles it submits per design (`ad-media/{designId}`), the new `collect_ad_media` reads those jobs' results on the merchant's account, and `show_ad_widget`, carousel cards and `add_video_audio` accept only the collected URLs plus the design's own images. Test added.
- **/simplify, reuse**: the concept-plus-feedback shape was written three times. Fixed with `conceptRevisionSchema`. `approvedConcepts` now replaces three filters. Skipped: a shared `mockupFor` and `designIdSchema` (they belong in `shared/design.ts` and the design widget, which another agent owns), a shared status pill (it would touch the design and campaign widgets), and live image pricing through `fal-pricing.ts` (that module is video-only today; the price is labelled as fal's list price).
- **/simplify, simplification**: `saveAd` was unused, so it was removed and the fixture now uses `saveConcepts`. Fixed: one `Decision` type in place of the copied `"approved" | "skipped"` unions, a derived `ConceptBusy`, and local-only schemas no longer exported. The index-matched card lookups were removed. Kept: the stored `Ad.status`. The campaign tool filters on it and the Meta agent may edit that code, so both store writers derive it with `adStatusOf`.
- **/simplify, efficiency**: card designs were read again per card. Fixed: they're deduplicated, the current design is reused, and `campaign_plan` passes the designs it has already loaded.
- **/simplify, altitude**: the legacy upgrade lived in the wire schema. Fixed: `adSchema` is plain again and the store reads with `storedAdSchema`. The media check now lives in `lib/ad-media.ts`.
- The `pr-review-toolkit` code-simplifier and silent-failure-hunter agents aren't installed in this session, so they weren't run. The /simplify pass and the security review stood in for them.

## Try it

1. Connect wovain and fal, then publish a design or use a live one.
2. Ask for ads for it. Expect a line with the image cost, then an ad widget with 2 to 4 concepts, each with Feed and Stories visuals, text variants and a button.
3. Give feedback on one concept, such as "more playful". Only that concept comes back, marked revision 2.
4. Approve one concept, skip the rest, and press **Create campaign** (or say "Run it"). The campaign widget shows Ready and Ads Manager holds a paused draft with one ad per approved concept. Nothing spends until Launch.
5. Storybook: `pnpm storybook`, then Widgets/Ad.

## Departures from the plan

- Added `collect_ad_media`, `lib/fal-media.ts` and `lib/ad-media.ts` after the security review, plus an `ad-media/{designId}` record. `plan.md` and `docs/spec.md` were updated in the same commit.
- No live fal or Meta run was done. The image price is fal's list price for `fal-ai/nano-banana-pro/edit` as of October 2026.
