import { z } from "zod";

// Image-to-video models on fal that wovain can use. Prices are fal's list
// prices (get_pricing, Oct 19, 2026); the widget shows them per clip.
// The default first: H3 Max Turbo, fal's throughput-tuned H3 Max ("no
// compromises on output quality"), at about $0.08 for a 5-second clip; it
// starts from a 9:16 ad image that already keeps the print. Compared on
// Oct 22, 2026 (fal get_pricing and model pages): LTX-Video 13B distilled
// ($0.04 per unit, p50 20 s, 720p max, older 0.9.7 weights) and Wan 2.2
// Turbo ($0.10 per clip, p50 93 s, p90 327 s). H3 Max Reference ($0.75 per
// 15-second clip) keeps the print without a start image.
export const videoModelIds = [
  "h3-max-turbo",
  "h3-max-reference",
  "kling-o1-reference",
  "kling-v3-standard",
  "kling-v3-pro",
  "h3-max",
] as const;

export type VideoModelId = (typeof videoModelIds)[number];

export interface VideoModel {
  endpointId: string;
  // True when the model takes the artwork as a reference (Kling elements or
  // reference images) so the print holds; others animate the mockup alone.
  keepsPrint: boolean;
  label: string;
  maxSeconds: number;
  shortLabel: string;
  usdPerSecond: number;
}

export const videoModels: Record<VideoModelId, VideoModel> = {
  "h3-max": {
    endpointId: "minimax/h3-max/image-to-video",
    keepsPrint: false,
    label: "MiniMax H3 Max",
    maxSeconds: 15,
    shortLabel: "H3 Max",
    usdPerSecond: 0.0325,
  },
  "h3-max-reference": {
    endpointId: "minimax/h3-max/reference-to-video",
    keepsPrint: true,
    label: "MiniMax H3 Max Reference",
    maxSeconds: 15,
    shortLabel: "H3 Ref",
    usdPerSecond: 0.05,
  },
  "h3-max-turbo": {
    endpointId: "minimax/h3-max-turbo/image-to-video",
    keepsPrint: false,
    label: "MiniMax H3 Max Turbo",
    maxSeconds: 15,
    shortLabel: "H3 Turbo",
    usdPerSecond: 0.01625,
  },
  "kling-o1-reference": {
    endpointId: "fal-ai/kling-video/o1/standard/reference-to-video",
    keepsPrint: true,
    label: "Kling O1 Standard Reference",
    maxSeconds: 10,
    shortLabel: "Kling O1",
    usdPerSecond: 0.084,
  },
  "kling-v3-pro": {
    endpointId: "fal-ai/kling-video/v3/pro/image-to-video",
    keepsPrint: true,
    label: "Kling v3 Pro",
    maxSeconds: 15,
    shortLabel: "Kling Pro",
    usdPerSecond: 0.14,
  },
  "kling-v3-standard": {
    endpointId: "fal-ai/kling-video/v3/standard/image-to-video",
    keepsPrint: true,
    label: "Kling v3 Standard",
    maxSeconds: 15,
    shortLabel: "Kling v3",
    usdPerSecond: 0.14,
  },
};

// A clip runs the requested length, capped at what the model can make.
export const clipSeconds = (model: VideoModelId, seconds: number) =>
  Math.min(seconds, videoModels[model].maxSeconds);

export const clipCost = (
  model: VideoModelId,
  seconds: number,
  prices?: VideoPrices
) =>
  (prices?.[model].usdPerSecond ?? videoModels[model].usdPerSecond) *
  clipSeconds(model, seconds);

// When the list prices above were read from fal; live prices replace them
// whenever the server has FAL_KEY.
export const LIST_PRICES_AS_OF = "Oct 19, 2026";

export const videoPricesSchema = z.record(
  z.enum(videoModelIds),
  z.object({
    source: z.enum(["fal", "list"]),
    usdPerSecond: z.number().nonnegative(),
  })
);
export type VideoPrices = z.infer<typeof videoPricesSchema>;

export const listVideoPrices = (): VideoPrices =>
  videoPricesSchema.parse(
    Object.fromEntries(
      videoModelIds.map((id) => [
        id,
        { source: "list", usdPerSecond: videoModels[id].usdPerSecond },
      ])
    )
  );
