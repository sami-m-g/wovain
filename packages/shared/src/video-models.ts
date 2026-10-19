import { z } from "zod";

// Image-to-video models on fal that wovain can use. Prices are fal's list
// prices (get_pricing, Oct 19, 2026); the card shows them per clip.
export const videoModelIds = [
  "kling-v3-standard",
  "kling-v3-pro",
  "h3-max-turbo",
  "h3-max",
] as const;

export type VideoModelId = (typeof videoModelIds)[number];

export interface VideoModel {
  endpointId: string;
  // Kling's "elements" pass the artwork as a reference so the print holds;
  // other models animate from the mockup alone, so check fidelity full screen.
  keepsPrint: boolean;
  label: string;
  shortLabel: string;
  usdPerSecond: number;
}

export const videoModels: Record<VideoModelId, VideoModel> = {
  "h3-max": {
    endpointId: "minimax/h3-max/image-to-video",
    keepsPrint: false,
    label: "MiniMax H3 Max",
    shortLabel: "H3 Max",
    usdPerSecond: 0.0325,
  },
  "h3-max-turbo": {
    endpointId: "minimax/h3-max-turbo/image-to-video",
    keepsPrint: false,
    label: "MiniMax H3 Max Turbo",
    shortLabel: "H3 Turbo",
    usdPerSecond: 0.01625,
  },
  "kling-v3-pro": {
    endpointId: "fal-ai/kling-video/v3/pro/image-to-video",
    keepsPrint: true,
    label: "Kling v3 Pro",
    shortLabel: "Kling Pro",
    usdPerSecond: 0.14,
  },
  "kling-v3-standard": {
    endpointId: "fal-ai/kling-video/v3/standard/image-to-video",
    keepsPrint: true,
    label: "Kling v3 Standard",
    shortLabel: "Kling v3",
    usdPerSecond: 0.14,
  },
};

export const clipCost = (
  model: VideoModelId,
  seconds: number,
  prices?: VideoPrices
) =>
  (prices?.[model].usdPerSecond ?? videoModels[model].usdPerSecond) * seconds;

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
