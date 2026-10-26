import { createFalClient } from "@fal-ai/client";
import { z } from "zod";

import type { Artwork, DesignBrief } from "./design";
import { REQUIRED_PX } from "./design";
import { external } from "./log";
import type { Logger } from "./log";

// Print art on fal, through its official client and the merchant's own fal
// key (they pay fal directly): GPT Image draws on a transparent background
// at print size, told to print exactly the brief's words and nothing else.
export const TEXT_TO_IMAGE = "openai/gpt-image-2.5/flare/text-to-image";

const imageSchema = z.object({
  images: z
    .array(
      // GPT Image on fal leaves width and height null: the size asked for
      // is the size drawn.
      z.object({
        height: z
          .int()
          .positive()
          .nullish()
          .transform((value) => value ?? REQUIRED_PX),
        url: z.url({ protocol: /^https$/u }),
        width: z
          .int()
          .positive()
          .nullish()
          .transform((value) => value ?? REQUIRED_PX),
      })
    )
    .min(1),
});

const textRule = (text: string[]) =>
  text.length === 0
    ? "No text, letters or numbers anywhere in the art."
    : `The only text in the art, spelled exactly: ${text.map((words) => `"${words}"`).join(", ")}. Print no other text.`;

export const artInput = (brief: DesignBrief) => ({
  background: "transparent",
  image_size: { height: REQUIRED_PX, width: REQUIRED_PX },
  num_images: 1,
  output_format: "png",
  prompt: `${brief.artPrompt}\n\n${textRule(brief.printedText)}\n\nPrint-ready t-shirt artwork only: no garment, no mockup, no background, nothing cropped at the edges.`,
  quality: "high",
});

// Two calls, so a durable step can key the paid one: `submit` queues the
// drawing and returns fal's request ID; `result` waits for that request and
// reads its image, as often as a retry needs, without drawing again.
export const createArtist = (apiKey: string) => {
  const fal = createFalClient({ credentials: apiKey });
  return {
    result: async (requestId: string, log?: Logger): Promise<Artwork> =>
      await external(
        log,
        { operation: "generate_art", provider: "fal" },
        async () => {
          const { queue } = fal;
          await queue.subscribeToStatus(TEXT_TO_IMAGE, { requestId });
          const { data } = await queue.result(TEXT_TO_IMAGE, { requestId });
          const [image] = imageSchema.parse(data).images;
          if (image === undefined) {
            throw new Error("fal returned no image");
          }
          return image;
        }
      ),
    submit: async (brief: DesignBrief, log?: Logger): Promise<string> =>
      await external(
        log,
        { operation: "submit_art", provider: "fal" },
        async () => {
          const queued = await fal.queue.submit(TEXT_TO_IMAGE, {
            input: artInput(brief),
          });
          return queued.request_id;
        }
      ),
  };
};

export type Artist = ReturnType<typeof createArtist>;
