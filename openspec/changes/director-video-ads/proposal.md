# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/352

## Why

The video ads from video-ad-creatives (#336, #337) are two 5-second silent clips of the mockup with a slow push-in. They don't read as ads: no person wears the shirt, there is no sound, no hook, no text and no call to action. Fashion ads on Reels sell the garment on a person, open with a hook in the first seconds, and are made to work with the sound on or off.

## What Changes

- A Mastra workflow, `ad-video`, on Inngest makes one finished ad per live product, where the environment sets `FAL_AD_VIDEO_MODELS` and prices the `adVideo` step. It replaces the silent clips there; elsewhere the clips work as before.
- A Director agent (`ad_director`, Nemotron on Nebius Token Factory) writes the ad from the drop's evidence: the Qloo audience, why now, the idea and the brief. It writes a 15 to 20 second 9:16 concept with a 3-second hook, 3 or 4 timed shots, the on-screen text, a sound direction (music, ambient sound, one spoken line at most) and a call to action.
- The cast: a fal image-edit model (Nano Banana Pro edit on next) puts a person in the actual shirt, from the product mockup and the approved art. Code sets the person's gender and age from the idea's Qloo buyers.
- The film: one image-to-video generation from the cast still, with native audio (Wan 3.0 Prime on next), the shots in one timed prompt so the music runs across the cuts.
- The finish: a 4:5 feed cut (fal's scale-video), then burned-in captions on each cut from the Director's text (VEED subtitles with an SRT), ending on the call to action and the label "AI-generated model".
- A Reviewer agent (`ad_video_review`, Nemotron VL) looks at the art, the cast still and frames of the finished cut, and checks the hook, product visibility, design distortion, text and Meta policy. On a fail it sends fixes to the Director once: one redo at most. An ad that still fails isn't saved.
- Every paid fal call is keyed (`once`), so a retried step reads the same request and never pays twice. The ad's credits (`creditCost.adVideo`, 60 on next) are held when the workflow starts, settled when the ad is saved, and given back when it fails.
- A failure never blocks a campaign: it is logged at error level and the campaign runs the image ads.
- Meta's video ads with an AI-generated person say so in their text too. The Campaign step shows the finished ads in their own shape, with controls and muted autoplay, and an AI-generated label.

## Capabilities

### Modified Capabilities

- `ads-and-campaigns`: director-made video ads replace the silent clips where they are on.

## Impact

- `packages/core/src/ad-video.ts` (concept, review and fal inputs), `packages/core/src/agents.ts` (two agents).
- `packages/mastra/src/mastra/flow/ad-video.ts`, `workflows/ad-video.ts`, `workflows/videos.ts`, `workflows/engine.ts`.
- `packages/billing` (`adVideo` step), `apps/web/.env.schema`, `infra/settings.ts`, `infra/next/Pulumi.next.yaml` (`falAdVideoModels`, `creditCost.adVideo`).
- `packages/core/src/ads.ts` (AI disclosure in the video ad's text), `apps/web` Campaign step, docs (en, es, fr).
