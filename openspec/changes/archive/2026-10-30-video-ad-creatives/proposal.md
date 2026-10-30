# Proposal

Issue: https://github.com/sami-m-g/wovain/issues/334

## Why

A drop's Meta campaign runs image ads only. Short video ads usually reach more people on Reels and Stories, and fal can animate the product mockup wovain already has.

## What Changes

- When a product goes live, an Inngest function (`product-videos`) asks fal to animate its mockup (or the approved design) into two 5-second clips, 9:16 and 1:1, with gentle motion. The model is `FAL_VIDEO_MODEL`, set per environment in Pulumi config. On next it is Wan 3.0 Prime image-to-video (`alibaba/wan-3.0-prime/image-to-video`), $0.05 a second on fal, so $0.25 a clip. It was picked with the fal MCP because it takes an explicit 9:16 or 1:1 aspect ratio.
- Each clip runs on wovain's fal key and costs `creditCost.video` credits (10 on next). The submit is keyed (`once`), so a retry polls the same fal request and never charges twice. A clip that fails is logged at error level through evlog and left out. The clips are saved on the product (`product.videos`).
- Video ads are off where `FAL_VIDEO_MODEL` or the `video` price is unset (production and nebius today).
- The Campaign step shows the clips next to the images, playable and muted.
- Campaign build uploads each clip to Meta (`ads_creative_upload_media`) and adds a video ad (`ads_create_creative` with `video_id`, then `ads_create_ad`) next to the image ads. A video that fails on Meta is logged and skipped, and the campaign launches with images.

## Capabilities

### Modified Capabilities

- `ads-and-campaigns`: video ad creatives in the Campaign step and on Meta.
