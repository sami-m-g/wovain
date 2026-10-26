import { setTimeout as sleep } from "node:timers/promises";

import { z } from "zod";

import type { Artwork, DesignBrief } from "./design";
import { REQUIRED_PX } from "./design";
import { external } from "./log";
import type { Logger } from "./log";
import { findAll, findOne } from "./upstream";
import type { ToolCall } from "./upstream";

// Print art on fal, through fal's MCP relay on the merchant's own fal
// account (they pay fal directly): GPT Image draws on a transparent
// background at print size, told to print exactly the brief's words and
// nothing else.
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

const POLL_MS = 3000;
// A drawing that takes longer fails the step, which retries and polls the
// same request again.
const WAIT_MS = 4 * 60 * 1000;

const statusSchema = z.object({ status: z.string() });

// Two calls, so a durable step can key the paid one: `submit` queues the
// drawing (submit_job) and returns fal's request ID; `result` waits for that
// request (check_job) and reads its image (get_job_result), as often as a
// retry needs, without drawing again. `call` is a session on the merchant's
// fal grant.
export const createArtist = (call: ToolCall, wait = sleep) => ({
  result: async (requestId: string, log?: Logger): Promise<Artwork> =>
    await external(
      log,
      { operation: "generate_art", provider: "fal" },
      async () => {
        const job = { endpoint_id: TEXT_TO_IMAGE, request_id: requestId };
        const deadline = Date.now() + WAIT_MS;
        for (;;) {
          // Polled one at a time: each check waits for the last.
          // oxlint-disable-next-line no-await-in-loop
          const reply = await call("check_job", job);
          const { status } = findOne(statusSchema, reply, "job status");
          if (status === "COMPLETED") {
            break;
          }
          if (Date.now() > deadline) {
            throw new Error(`fal is still drawing (${status})`);
          }
          // oxlint-disable-next-line no-await-in-loop
          await wait(POLL_MS);
        }
        const [drawn] = findAll(imageSchema, await call("get_job_result", job));
        const [image] = drawn?.images ?? [];
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
      async () =>
        findOne(
          z.object({ request_id: z.string().min(1) }),
          await call("submit_job", {
            endpoint_id: TEXT_TO_IMAGE,
            input: artInput(brief),
            // The prompt is the merchant's design: fal needn't keep it.
            store_payload: false,
          }),
          "request ID"
        ).request_id
    ),
});

export type Artist = ReturnType<typeof createArtist>;
