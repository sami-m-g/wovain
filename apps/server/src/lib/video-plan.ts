import type { AdSlot } from "@wovain/shared/ad";
import type { Design } from "@wovain/shared/design";
import type { Settings } from "@wovain/shared/settings";
import {
  clipCost,
  clipSeconds,
  videoModels,
} from "@wovain/shared/video-models";
import type { VideoModelId, VideoPrices } from "@wovain/shared/video-models";

// Turns settings and a design into ready-to-submit fal requests, one per clip,
// so the wovain-ads skill passes them to fal's submit_jobs unchanged.

const MMAUDIO = "fal-ai/mmaudio-v2";
const MMAUDIO_USD_PER_SECOND = 0.001;

// Two UGC angles per product (prd.md > Ad cards: Video A and Video B).
const angles: Record<AdSlot, { angle: string; scene: string }> = {
  A: {
    angle: "UGC on-model",
    scene:
      "Vertical phone video. A person in a sunlit home wears the t-shirt, turns slightly toward the camera and smooths the shirt with one hand. Natural handheld camera, soft daylight.",
  },
  B: {
    angle: "UGC styling",
    scene:
      "Vertical phone video. A person styles the t-shirt for a day out, tucking it in front of a mirror, then steps back to show the whole outfit. Natural handheld camera.",
  },
};

const keepPrint =
  "Keep the print exactly as the artwork reference: same image, colors and position, centered on the chest and fully visible. No text overlays.";

type Input = Record<string, unknown>;

const h3Resolution = (resolution: Settings["video"]["resolution"]) =>
  resolution === "1080p" ? "1080P" : "768P";

const buildInput = (
  model: VideoModelId,
  design: Design,
  settings: Settings,
  slot: AdSlot
): Input => {
  const mockup = design.mockups[0]?.url ?? design.artwork.url;
  const artwork = design.artwork.url;
  const seconds = clipSeconds(model, settings.video.seconds);
  const { scene } = angles[slot];
  switch (model) {
    case "h3-max-reference": {
      return {
        aspect_ratio: "9:16",
        duration: seconds,
        prompt: `${scene} The t-shirt is the one in Image 1; its print is Image 2. ${keepPrint}`,
        prompt_expansion_mode: "disabled",
        reference_image_urls: [mockup, artwork],
        resolution: h3Resolution(settings.video.resolution),
      };
    }
    case "kling-o1-reference": {
      return {
        aspect_ratio: "9:16",
        duration: String(seconds),
        elements: [
          { frontal_image_url: artwork, reference_image_urls: [mockup] },
        ],
        image_urls: [mockup],
        prompt: `${scene} The t-shirt is @Image1; its print is @Element1. ${keepPrint}`,
      };
    }
    case "kling-v3-pro":
    case "kling-v3-standard": {
      return {
        duration: String(seconds),
        generate_audio: settings.audio.source === "kling-native",
        prompt: `${scene} ${settings.video.elements ? "The print is @Element1. " : ""}${keepPrint}`,
        start_image_url: mockup,
        ...(settings.video.elements && {
          elements: [
            { frontal_image_url: artwork, reference_image_urls: [mockup] },
          ],
        }),
      };
    }
    case "h3-max":
    case "h3-max-turbo": {
      return {
        duration: seconds,
        image_url: mockup,
        prompt: `${scene} ${keepPrint}`,
        prompt_expansion_mode: "disabled",
        resolution: h3Resolution(settings.video.resolution),
      };
    }
    default: {
      const unknown: never = model;
      throw new Error(`No input builder for ${String(unknown)}`);
    }
  }
};

export interface VideoPlan {
  audio: { endpointId: string; perClip: Input; usdPerClip: number } | undefined;
  clips: { angle: string; endpointId: string; input: Input; slot: AdSlot }[];
  // fal's price list doesn't cover resolution, audio or provider rules, so the
  // real charge can be higher (the first real run billed about 60% more).
  estimate: { basis: string; note: string; usd: number };
  keepsPrint: boolean;
  model: string;
}

export const planVideos = (
  design: Design,
  settings: Settings,
  prices: VideoPrices
): VideoPlan => {
  const { model } = settings.video;
  const slots = (["A", "B"] as const).slice(0, settings.video.clipsPerProduct);
  const seconds = clipSeconds(model, settings.video.seconds);
  // Kling's native audio replaces MMAudio when chosen; it only exists on Kling.
  const needsMmaudio =
    settings.audio.source === "mmaudio" ||
    (settings.audio.source === "kling-native" && !model.startsWith("kling-v3"));
  const audio = needsMmaudio
    ? {
        endpointId: MMAUDIO,
        perClip: { duration: seconds, prompt: settings.audio.prompt },
        usdPerClip: MMAUDIO_USD_PER_SECOND * seconds,
      }
    : undefined;
  const perClip = clipCost(model, settings.video.seconds, prices);
  return {
    audio,
    clips: slots.map((slot) => ({
      angle: angles[slot].angle,
      endpointId: videoModels[model].endpointId,
      input: buildInput(model, design, settings, slot),
      slot,
    })),
    estimate: {
      basis:
        prices[model].source === "fal"
          ? "live fal list price"
          : "fal list price",
      note: "List price; fal may bill more for resolution, audio and provider rules. Run video_spend afterwards for the actual charge when it's set up.",
      usd: slots.length * (perClip + (audio?.usdPerClip ?? 0)),
    },
    keepsPrint: videoModels[model].keepsPrint,
    model: videoModels[model].label,
  };
};
