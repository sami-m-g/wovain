import { createFalClient } from "@fal-ai/client";
import { z } from "zod";

import type { Artwork, DesignBrief } from "./design";
import { REQUIRED_PX } from "./design";
import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// Print art on fal, through its official client and wovain's FAL_KEY: GPT
// Image draws on a transparent background at print size, told to print
// exactly the brief's words and nothing else.
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

export const createArtist = (apiKey: string | undefined) => {
  const fal =
    apiKey === undefined ? undefined : createFalClient({ credentials: apiKey });
  return async (brief: DesignBrief, log?: Logger): Promise<Artwork> => {
    if (fal === undefined) {
      throw notConfigured("fal", "FAL_KEY");
    }
    return await external(
      log,
      { operation: "generate_art", provider: "fal" },
      async () => {
        const { data } = await fal.subscribe(TEXT_TO_IMAGE, {
          input: artInput(brief),
        });
        const [image] = imageSchema.parse(data).images;
        if (image === undefined) {
          throw new Error("fal returned no image");
        }
        return image;
      }
    );
  };
};

export type Artist = ReturnType<typeof createArtist>;
