import { z } from "zod";

import { findOne } from "./upstream";

// Video ad creatives (openspec change video-ad-creatives): fal animates a
// published product's mockup into short clips for its Meta campaign. The
// model is FAL_VIDEO_MODEL (apps/web/.env.schema), set per environment in
// Pulumi config; the input below is Wan 3.0 Prime's image-to-video schema
// (alibaba/wan-3.0-prime/image-to-video, $0.05 a second on fal, checked with
// the fal MCP on 2026-10-30), so a different model may need its own.

// Reels and Stories first, then the square feed.
export const VIDEO_ASPECTS = ["9:16", "1:1"] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

const VIDEO_SECONDS = 5;

const MOTION_PROMPT =
  "Gentle, slow camera push-in on the product, with soft natural light. The garment and its print stay exactly as they are: no new text, no changes to the design, no people appearing. Calm, minimal background.";

export const videoAdInput = (imageUrl: string, aspect: VideoAspect) => ({
  aspect_ratio: aspect,
  audio: false,
  duration: VIDEO_SECONDS,
  prompt: MOTION_PROMPT,
  resolution: "720p",
  start_image_url: imageUrl,
});

// The clip's URL in fal's result.
export const videoUrlOf = (reply: unknown) =>
  findOne(
    z.object({ video: z.object({ url: z.url({ protocol: /^https$/u }) }) }),
    reply,
    "video"
  ).video.url;

// One clip of a product, as the product row keeps it.
export interface AdVideo {
  aspect: VideoAspect;
  url: string;
}
