import { setTimeout as sleep } from "node:timers/promises";

import { createFalClient } from "@fal-ai/client";
import type { FalClient } from "@fal-ai/client";
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
// nothing else. The fal endpoint is FAL_IMAGE_MODEL (apps/web/.env.schema),
// set per environment through Pulumi config (infra/index.ts).

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

// Any fal model as two calls, so a durable step can key the paid one:
// `submit` queues the job (submit_job) and returns fal's request ID;
// `result` waits for that request (check_job) and returns its output
// (get_job_result), as often as a retry needs, without paying again.
// `call` is a session on the merchant's fal grant.
export const createFalJobs = (
  call: ToolCall,
  { wait = sleep }: { wait?: (ms: number) => Promise<unknown> } = {}
) => ({
  result: async (model: string, requestId: string): Promise<unknown> => {
    const job = { endpoint_id: model, request_id: requestId };
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
    return await call("get_job_result", job);
  },
  submit: async (model: string, input: Record<string, unknown>) =>
    findOne(
      z.object({ request_id: z.string().min(1) }),
      await call("submit_job", {
        endpoint_id: model,
        input,
        // The prompt is the merchant's design: fal needn't keep it.
        store_payload: false,
      }),
      "request ID"
    ).request_id,
});

export type FalJobs = ReturnType<typeof createFalJobs>;

// One design's print art, on createFalJobs; `model` is the fal endpoint ID
// that draws.
export const createArtist = (
  call: ToolCall,
  {
    model,
    wait = sleep,
  }: { model: string; wait?: (ms: number) => Promise<unknown> }
) => {
  const jobs = createFalJobs(call, { wait });
  return {
    result: async (requestId: string, log?: Logger): Promise<Artwork> =>
      await external(
        log,
        { operation: "generate_art", provider: "fal" },
        async () => {
          const [drawn] = findAll(
            imageSchema,
            await jobs.result(model, requestId)
          );
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
        async () => await jobs.submit(model, artInput(brief))
      ),
  };
};

export type Artist = ReturnType<typeof createArtist>;

// https://fal.ai/docs/documentation/model-apis/common-parameters#x-fal-store-io
const STORE_IO = "X-Fal-Store-IO";

// fal on wovain's own key (FAL_KEY), paid by the design's credits: the same
// three tools the merchant's fal relay answers, on fal's queue API through
// @fal-ai/client, so createArtist draws the same way on either.
export const falKeyCall = (
  apiKey: string,
  client: Pick<FalClient, "queue"> = createFalClient({ credentials: apiKey })
): ToolCall => {
  const job = z.object({ endpoint_id: z.string().min(1) });
  const queued = job.extend({ request_id: z.string().min(1) });
  const submitted = job.extend({
    input: z.record(z.string(), z.unknown()),
    store_payload: z.boolean().optional(),
  });
  return async (tool, args) => {
    if (tool === "submit_job") {
      const {
        endpoint_id: endpoint,
        input,
        store_payload: store,
      } = submitted.parse(args);
      // store_payload: false keeps the request out of fal's request history,
      // as the relay's submit_job does (fal's X-Fal-Store-IO header).
      const { request_id: requestId } = await client.queue.submit(endpoint, {
        input,
        ...(store === false ? { headers: { [STORE_IO]: "0" } } : {}),
      });
      return { request_id: requestId };
    }
    if (tool === "check_job") {
      const { endpoint_id: endpoint, request_id: requestId } =
        queued.parse(args);
      const { status } = await client.queue.status(endpoint, { requestId });
      return { status };
    }
    if (tool === "get_job_result") {
      const { endpoint_id: endpoint, request_id: requestId } =
        queued.parse(args);
      const { data } = await client.queue.result(endpoint, { requestId });
      return data;
    }
    throw new Error(`fal on wovain's key has no tool ${tool}`);
  };
};
