---
name: wovain-ads
description: Make the ad card for each product the merchant published with wovain — two short UGC-style videos with background audio, burned-in captions and brand, the mockup as a static, ad copy and the breakeven math. Use right after a design goes live, and when a chat message says "Added the ads for design dN", "Skipped the ads for design dN", "Feedback on the ads for design dN" or "Retry video X for design dN".
---

# wovain-ads

One ad card per published product: two videos, the mockup, a headline and primary text, and the numbers the campaign rules will use. Nothing reaches Meta here; the merchant adds or skips each card, and the campaign launches after the last one.

## Make the ad card (per live design)

1. **Plan.** wovain `video_plan` with the `designId`. It returns one ready fal request per clip, the background-audio request, the model, whether it keeps the print, and the estimated cost. Say the estimate in one line before spending, labeled as fal's list price ("Two clips with H3 Max Reference: about $1.53 at fal's list price; the actual charge can be higher.").
2. **Generate.** fal `submit_jobs` with every clip's `endpointId` and `input` exactly as planned, then `wait_for_jobs`. Don't edit the inputs.
3. **Audio.** When the plan has `audio`, run it on each finished clip: fal `run_model` (or `submit_jobs`) with the audio `endpointId`, `video_url` set to the clip's URL and the plan's `perClip` values. Use the returned video from here on. If the plan has no `audio`, keep the clip as it is.
4. **Finish.** wovain `finish_video` for each clip with the shop name as `brand`, the shop's `logoUrl` from `ecommerce_get-current-shop` when it has one, a caption of 6 to 10 words that sells the design (not the garment specs), the `designId`, the `slot` and the clip's URL. The brand overlay is off unless the merchant turned it on in Settings; captions sit inside Meta's safe zone. It returns the public URL to use.
5. **Copy.** Headline: short and product-led (≤ 40 characters). Primary text: 2 to 3 lines in the friendly-coach voice, one concrete detail of the design, no claims you can't back.
6. **Card.** wovain `show_ad_card` with the `designId`, the videos (`slot`, `angle` from the plan, `seconds`, `status: "ready"` and the finished `url`; a clip that failed twice goes in as `status: "failed"` without a URL), the copy and one coach line ("Two try-on clips plus your mockup. Good margin for a test."). wovain adds the mockup, the breakeven math and the rule thresholds. Then call wovain `video_spend` with `since` set to when you submitted the clips and, if it's set up, say what fal actually charged in one line. Then stop and wait.

When the plan says the model doesn't keep the print, add to the coach line that it's a test model and to check the print full screen.

## When the merchant acts on the card

- **"Added the ads for design dN"** or **"Skipped the ads for design dN"**: the card already recorded it. If other ad cards are still waiting, say which, in one line. When none are waiting and at least one was added, start the `wovain-campaign` skill. If every card was skipped, say no campaign will launch.
- **"Feedback on the ads for design dN: …"**: redo only what the feedback touches (copy, caption, one clip or both) and redraw with `show_ad_card` for the same `designId`.
- **"Retry video X for design dN"**: generate that slot again from `video_plan`, finish it, and redraw the card with both slots.

## Rules

- Never launch, upload to Meta or spend ad budget from this skill.
- Spend on video only after saying the estimate; one retry per failed clip, then show it as failed (the merchant can retry from the card or go with the static image).
- Keep captions and copy honest: no prices, discounts or claims the product page doesn't make.
