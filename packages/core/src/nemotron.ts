import { AsyncLocalStorage } from "node:async_hooks";

import { OpenAI } from "@posthog/ai/openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { PostHog } from "posthog-node";
import type { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// NVIDIA Nemotron 3 Super (120B, 12B active) on Nebius Token Factory, through
// its OpenAI-compatible API and the official OpenAI SDK. wovain's own model
// calls (design briefs, the design judge, ad copy and autopilot's decisions)
// all go through `ask`, which returns schema-checked JSON.
//
// PostHog LLM analytics (posthog.com/docs/ai-observability) wraps the client:
// each call is a $ai_generation event with its step ($ai_span_name), tokens,
// latency and cost, grouped by run ($ai_trace_id) and merchant.
export const NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b";
// Nebius Token Factory's list price, USD per token ($0.30 and $0.90 per 1M).
const PRICE = { input: 0.3e-6, output: 0.9e-6 } as const;

export interface LlmTrace {
  distinctId: string;
  traceId: string;
}
const traces = new AsyncLocalStorage<LlmTrace>();
// Every Nemotron call inside `run` belongs to this run's trace.
export const withLlmTrace = async <T>(
  trace: LlmTrace,
  run: () => Promise<T>
): Promise<T> => await traces.run(trace, run);

export interface NebiusConfig {
  apiKey: string | undefined;
  baseURL: string;
  // "production" or "development", as on every other PostHog event.
  environment: string;
  // PostHog's project token and ingestion host; without a key, no analytics.
  posthogKey?: string | undefined;
  posthogHost: string;
}

export interface Ask<T extends z.ZodType> {
  log?: Logger | undefined;
  // Names the call in logs, in the response format and in PostHog.
  name: string;
  prompt: string;
  schema: T;
  system: string;
  temperature?: number;
}

export const createNemotron = ({
  apiKey,
  baseURL,
  environment,
  posthogHost,
  posthogKey,
}: NebiusConfig) => {
  const posthog = new PostHog(posthogKey ?? "off", {
    disabled: posthogKey === undefined,
    host: posthogHost,
  });
  const client =
    apiKey === undefined
      ? undefined
      : new OpenAI({ apiKey, baseURL, posthog, timeout: 90_000 });
  return async <T extends z.ZodType>({
    log,
    name,
    prompt,
    schema,
    system,
    temperature = 0.4,
  }: Ask<T>): Promise<z.output<T>> => {
    if (client === undefined) {
      throw notConfigured.nebius();
    }
    const trace = traces.getStore();
    return await external(
      log,
      { operation: name, provider: "nebius" },
      async () => {
        // parse goes through the wrapped create, so PostHog still captures it.
        const completion = await client.chat.completions.parse({
          messages: [
            { content: system, role: "system" },
            { content: prompt, role: "user" },
          ],
          model: NEMOTRON_MODEL,
          // Cloud Run throttles CPU after the response: send it now.
          posthogCaptureImmediate: true,
          posthogProperties: {
            $ai_input_token_price: PRICE.input,
            $ai_output_token_price: PRICE.output,
            $ai_span_name: name,
            environment,
          },
          ...(trace && {
            posthogDistinctId: trace.distinctId,
            posthogTraceId: trace.traceId,
          }),
          response_format: zodResponseFormat(schema, name),
          temperature,
        });
        const parsed = completion.choices[0]?.message.parsed;
        if (parsed === null || parsed === undefined) {
          throw new Error("Nemotron returned no structured answer");
        }
        // The SDK infers the same output type through its own helper type,
        // which TypeScript can't match to z.output while T is generic.
        return parsed as z.output<T>;
      }
    );
  };
};

export type Nemotron = ReturnType<typeof createNemotron>;
