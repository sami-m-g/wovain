# Spec: distinct Meta ad concepts per product

Intent: [intent.md](intent.md)

## Requirements

- An ad record holds 1 to 6 concepts. Each has an id (`c1`…), name, angle, hook (≤ 125 characters), audience, optional why-now and gap, visuals (kind, ratio 1:1, 4:5 or 9:16, source `fal` or `fourthwall`, ready or failed), optional carousel cards (2 to 10), 1 to 5 primary texts, 1 to 5 headlines (≤ 40 characters), a shopping CTA, a revision number, the feedback that made it, and a status (draft, approved, skipped).
- The product's status follows its concepts: draft while any is undecided, added when one or more is approved, skipped when all are skipped.
- `show_ad_widget` takes new or revised concepts. A revised concept goes back to draft with the next revision; the others keep their choice.
- Visuals must be the design's own artwork and mockups or fal media that wovain collected from jobs it submitted for that design on the merchant's account (`collect_ad_media`). Carousel cards must point at live designs and their own images.
- `record_ad` decides one concept and returns the product's ads and how many widgets still wait.
- `generate_ad_images` submits one fal job per image on the merchant's account: the chosen mockup plus the artwork as references, the playbook's scene, a fixed print-keeping instruction, Meta's ratio. The agent picks the scene, never the model or the references.
- `campaign_plan` returns one ad per approved concept, named `wovain dN · cN`, with visuals by ratio, text variants, CTA, an AI-made flag and carousel cards with each product's link.
- The ads playbook finds the signals, writes distinct concepts (proposing its own when the merchant has no idea), makes the visuals, handles per-concept feedback and hands "Run it" to the campaign playbook.
- The campaign playbook builds a multi-media creative (Meta picks the visual per placement, up to 5 texts and headlines) for 2+ visuals, a single image or video ad for one, and a static carousel for cards. It asks the merchant about Meta's AI label when any visual is AI-made.
- Ad records stored before this change read as one concept.

## Design

- **Shared schema** (`packages/shared/src/ad.ts`): `conceptInputSchema` (what the playbook writes), `adConceptSchema` (+ revision, feedback, status), `adSchema` with a `z.preprocess` that turns the old `{headline, primaryText, videos}` shape into one concept. Pure helpers `mergeConcepts`, `adStatusOf`, `ratioLabel`.
- **Store**: `saveConcepts` (merge in a transaction) and `recordConcept` (replaces `recordAd`), both setting the product status from `adStatusOf`.
- **Images**: `lib/ad-images.ts` builds Nano Banana Pro edit inputs (`fal-ai/nano-banana-pro/edit`, $0.15 an image at fal's list price, 2K, JPEG). Submitted through the existing `submit` helper in `tools/ads.ts` (`upstreamReply` on the merchant's fal grant), so a missing connection answers `needsConnection` as the video tools do.
- **Campaign plan**: `lib/ad-plan.ts` `approvedAds` keeps the change to `tools/campaign.ts` to a few lines.
- **Widget**: `ad-widget-view.tsx` (header, concepts, economics, Create campaign, full-screen view) and `concept-card.tsx` (hook, signals, visuals with placement and AI labels, variants, CTA, Approve, Skip, feedback). Messages: "Approved ad cN for design dN", "Skipped …", "Feedback on ad cN for design dN: …", "Retry the … of ad cN for design dN", "Create the campaign".
- **Specs used** (Meta Business Help, through the Meta Ads MCP's `ads_get_help_article`): primary text 125, headline 40 and description 25 characters before truncation (help/223409425500940); up to 5 text options per field (help/180641596861873); carousel 2 to 10 cards, 1:1 recommended at 1080 px (help/1114358518575630); Stories 9:16 at 1080×1920, keep about 14% top and bottom clear (help/201503794673956, help/980593475366490); the Meta Ads MCP's `ads_create_creative` takes `multi_media` with `primary_texts` and `headlines`, `cards` for a static carousel, and `self_ai_disclosure`, which the merchant decides.
- **Checked before building**: fal's `nano-banana-pro/edit` and `nano-banana-2/edit` schemas and prices (fal MCP); claude-ads' `ads-create`, `ads-creative` and Meta creative-spec guidance (MIT, credited in `NOTICE`); the existing `upstreamReply`, `breakeven`, `ruleThresholds`, `adName` and `useAction` helpers.

## Areas of concern

- **Spend**: images cost the merchant's fal credits. The playbook says the total first, the tool caps a call at 8 images and its description states the price. Meta spend stays behind Launch.
- **Untrusted URLs in ads**: visuals and cards are limited to the design's own Fourthwall images and fal media collected from wovain's own jobs (job handles stored at submit, results read with `get_job_result` on the merchant's grant), so neither a prompt-injected link nor someone else's fal output can reach a Meta ad or `add_video_audio`.
- **Stored shape**: the preprocess keeps old records readable; a unit test pins it.
- **Copy honesty**: the playbook forbids prices, scarcity, reviews, testimonials, unbacked claims and brand or character names.
- **AI disclosure**: fal visuals are flagged; the merchant chooses `self_ai_disclosure`.
- **Shared campaign code**: the campaign tool change is the plan's product shape and the widget's ad count; the playbook change is the build step. Listed in the MR for the Meta agent.
