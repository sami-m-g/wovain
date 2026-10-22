# Plan: distinct Meta ad concepts per product

Spec: [spec.md](spec.md)

The plan checkpoint was waived: the owner asked to build.

## Files

| File | Change |
| --- | --- |
| `packages/shared/src/ad.ts` | Concept, asset and card schemas; legacy upgrade; `mergeConcepts`, `adStatusOf`, `ratioLabel` |
| `apps/server/src/store.ts` | `saveConcepts`, `recordConcept` (replaces `recordAd`) |
| `apps/server/src/lib/ad-images.ts` | New: Nano Banana Pro edit inputs |
| `apps/server/src/lib/ad-plan.ts` | New: `approvedAds` for the campaign plan |
| `apps/server/src/tools/ads.ts` | `generate_ad_images`; `show_ad_widget` and `record_ad` per concept; URL checks |
| `apps/server/src/tools/campaign.ts` | Plan products carry `ads`; widget counts approved concepts |
| `apps/server/src/playbooks/ads.ts` | Rewritten: signals, concepts, visuals, feedback, "Run it" |
| `apps/server/src/playbooks/campaign.ts` | Paused build from concepts: multi-media, single, carousel; AI label when AI-made |
| `apps/widgets/src/ad/*` | Concept cards, per-concept actions, Create campaign, stories |
| `docs/prd.md`, `docs/spec.md`, `docs/scope.md`, `README.md`, `docs/app-map.html`, `NOTICE` | The new ads behavior and the claude-ads credit |

## Order

1. Shared schema and helpers, with unit tests.
2. Store, image builder, ad tools, campaign plan, with integration tests.
3. Playbooks.
4. Widget and stories.
5. Docs, checks, review agents, verify.md, MR.

## Risks

- The campaign playbook and tool are shared with the Meta agent: keep the edits small and list them in the MR.
- Old ad records: covered by the preprocess and its test.
- Image prices can change: the constant is labelled as fal's list price and the playbook says the real charge can be higher.

## Tests that prove it

- Unit: product status from concepts; merge revises one concept and keeps the others; a legacy record reads as one concept.
- Integration: breakeven numbers unchanged; `record_ad` per concept and the waiting count; feedback revises one concept and keeps the other's approval; foreign visual URLs refused; carousel needs live designs; `generate_ad_images` sends the mockup and artwork references; `campaign_plan` lists only approved concepts with `aiMade`.
- Stories: draft (light and dark), approve, skip, feedback, revised, failed visual with retry, ready for campaign (light and dark), full screen, failed approve.
