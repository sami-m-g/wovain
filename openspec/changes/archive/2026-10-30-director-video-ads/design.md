# Design

## Context

`product-videos` (video-ad-creatives) animates the mockup into two silent 5 s clips per product on wovain's fal key, charged per clip. The run workflow is a Mastra workflow on Inngest (docs/adr/0001); paid provider calls are keyed with `once`; credits are reserved, settled or released (`flow/spend`). Agents are Mastra agents on Nemotron through the agent kit (`agents/kit`), called with `core.nemotron`.

## Goals / Non-Goals

Goals: a finished ad with a person, sound, a hook and captions, at about $3 or less per ad; durable, keyed steps; never blocking a campaign.

Non-goals: per-language voice-overs, several concepts per product, A/B tests of video concepts, regenerating ads for products already live.

## Decisions

### Models (picked with the fal MCP, 2026-10-30)

| Job | Endpoint | Price | Why |
| --- | --- | --- | --- |
| Cast | `fal-ai/nano-banana-pro/edit` | $0.15 an image | Multi-reference edit (mockup and art) that keeps printed artwork and text, at a listed price. FASHN and the other try-on models need a photo of a person to dress. |
| Film | `alibaba/wan-3.0-prime/image-to-video` | $0.05 a second | Native audio, 9:16, 2 to 30 s from one start frame: one 15 to 20 s take keeps the person, the shirt and the music continuous across the shots. |
| 4:5 cut | `fal-ai/workflow-utilities/scale-video` | $0.001 a compute second | Center crop to 720x900 on fal. |
| Captions | `veed/subtitles` | $0.10 a minute | Burns an SRT wovain writes (no transcription), so the on-screen text, the call to action and the AI label are exact. |
| Frames | `fal-ai/ffmpeg-api/extract-frame` | about $0 | First, middle and last frame for the Reviewer. |

All five are `FAL_AD_VIDEO_MODELS` (JSON, Pulumi `falAdVideoModels`), so a model changes per environment without code.

Cost per finished ad: cast $0.15, film 18 s $0.90, two captioned cuts about $0.20, crop and frames about $0.03: about $1.28. With the one redo (recast, refilm, refinish) it is at most about $2.56. The Nemotron calls cost cents.

### Assembly on fal, not ffmpeg or Remotion

The film is one generation, so there is nothing to join or mix: the cut needs a crop and burned captions. fal's utilities do both as keyed queue jobs, like every other fal call, with no ffmpeg binary or fonts in the Cloud Run image and nothing to upload. Remotion isn't in the stack; it would need a renderer (Lambda or a Chromium container) for two overlays.

### Native audio, not a voice-over and a music bed

Wan 3.0 Prime generates music, ambient sound and speech with the picture, and one take keeps the music continuous across the shots. A separate voice-over and music bed would need a mix with ducking that fal's compose can't do (it has no volume control).

### Workflow shape

`ad-video` is a linear Mastra workflow: `hold`, `direct`, `cast`, `film`, `finish`, `review`, then the redo steps `revise`, `recast`, `refilm`, `refinish`, `rereview`, which pass through when the first review passed, then `save`. A loop with a counter would be shorter, but linear steps give each paid call its own memoized Inngest step. Each paid submit is `once`-keyed by product and attempt; reading its result is free and repeatable.

The Director writes the look, the setting, the shots and the words. Code sets the person's gender and age band from the idea's Qloo buyers, so the cast always matches the audience.

### Credits

`creditCost.adVideo` (60 on next, about $1.50 at $0.025 a credit) is held once (keyed) when the workflow starts, settled at `save`, and released on a rejection or a failure (`onError`). A merchant without the credits gets no ad, and the campaign runs images.

### Disclosure

The last caption cue reads "AI-generated model", and the video ad's text on Meta ends with "Model is AI-generated." Meta labels AI content itself when it detects it; wovain says it either way.

## Risks / Trade-offs

- Wan may not cut cleanly between the timed shots. The Reviewer sees frames and can send fixes; the worst case is one continuous take.
- VEED places the captions where its preset does, and paces each cue's words through the cue (Reels-style captions) instead of showing the cue whole; neighbouring cues can share a line. The call to action and the AI label are separate cues for that reason. Exact text overlays would need an ffmpeg drawtext step in the app's image, which it doesn't have. The Reviewer checks that text doesn't cover the print.
- An 18 s Wan take ran about 4.5 minutes in the verification run, longer than one fal wait (4 minutes): the film step's retry reads the same request again, at no cost.

## Verification (2026-10-30)

One real run of the production inputs on fal (the Director's concept written to its rules, as Nemotron on fal's queue didn't start): cast $0.15, an 18 s Wan take with an AAC audio track (music, ambient sound, the line; mean -14 dB) $0.90, the 4:5 crop and two captioned cuts, and frames. The print stayed accurate through the cast and the film. About $1.27 for the finished ad.

- 9:16: https://v3b.fal.media/files/b/0ab07f9d/YKlKeHAt4Qy2r0EC7qodO_6752532f-364c-4483-a0cc-33dac080ac1b.mp4
- 4:5: https://v3b.fal.media/files/b/0ab07fa1/S5-G989B6RQHvsHPf4rYJ_bdff2c27-bd82-438c-ae9a-f3604146488f.mp4
- The Reviewer sees three frames, not motion, so a distortion between them can pass.
