import { EVENTS, eventSchemas } from "@wovain/core/events";
import { VIDEO_ASPECTS } from "@wovain/core/video-ads";
import type { AdVideo } from "@wovain/core/video-ads";
import type { Inngest } from "inngest";
import { NonRetriableError } from "inngest";

import type { Actor } from "../flow/actor";
import {
  logVideoFailure,
  productVideoUrl,
  saveProductVideos,
  submitProductVideo,
} from "../flow/videos";
import type { RunServices } from "./run";

// A live product's video ad clips (openspec video-ad-creatives), one aspect
// per pair of steps: the keyed, charged submit, then the wait for fal's
// result. A clip that still fails after its retries is logged and left
// out; the clips that worked are saved on the product either way.

export const createVideoFunctions = (
  inngest: Inngest,
  services: RunServices
) => [
  inngest.createFunction(
    {
      concurrency: { key: "event.data.productId", limit: 1 },
      id: "product-videos",
      triggers: { event: EVENTS.productVideos },
    },
    async ({ event, step }) => {
      const parsed = eventSchemas[EVENTS.productVideos].safeParse(event.data);
      if (!parsed.success) {
        throw new NonRetriableError("A product videos event without a product");
      }
      const { productId, userId } = parsed.data;
      const actor: Actor = { ...services, userId };
      const videos: AdVideo[] = [];
      for (const aspect of VIDEO_ASPECTS) {
        try {
          // One clip at a time.
          // oxlint-disable-next-line no-await-in-loop
          const requestId = await step.run(
            `submit-${aspect}`,
            async () => await submitProductVideo(actor, productId, aspect)
          );
          // oxlint-disable-next-line no-await-in-loop
          const url = await step.run(
            `clip-${aspect}`,
            async () => await productVideoUrl(actor, requestId)
          );
          videos.push({ aspect, url });
        } catch (error) {
          // Logged inside a step, so a replay doesn't log it again.
          // oxlint-disable-next-line no-await-in-loop
          await step.run(`failed-${aspect}`, () => {
            logVideoFailure(actor, { aspect, error, productId });
            return { failed: aspect };
          });
        }
      }
      const saved = await step.run(
        "save",
        async () => await saveProductVideos(actor, productId, videos)
      );
      return { productId, saved };
    }
  ),
];
