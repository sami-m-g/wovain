import { AsyncLocalStorage } from "node:async_hooks";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Agent } from "@mastra/core/agent";
import { withTracing } from "@posthog/ai/vercel";
import { PostHog } from "posthog-node";
import type { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// NVIDIA Nemotron 3 Super (120B, 12B active) on Nebius Token Factory, through
// its OpenAI-compatible API (the AI SDK's openai-compatible provider) and a
// Mastra agent per call. wovain's own model calls (design briefs, the design
// judge, ad copy and autopilot's decisions) all go through `ask`, which
// returns schema-checked JSON.
//
// PostHog LLM analytics (posthog.com/docs/ai-observability) wraps the model:
// each call is a $ai_generation event with its step ($ai_span_name), tokens,
// latency and cost, grouped by run ($ai_trace_id = the run's ID) and
// merchant.
export const NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b";
// Nebius Token Factory's list price, USD per token ($0.30 and $0.90 per 1M).
const PRICE = { input: 0.3e-6, output: 0.9e-6 } as const;
const TIMEOUT_MS = 90_000;

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
  // Names the call in logs, as the agent's ID and in PostHog.
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
  const nebius =
    apiKey === undefined
      ? undefined
      : createOpenAICompatible({
          apiKey,
          baseURL,
          name: "nebius",
          supportsStructuredOutputs: true,
        });
  return async <T extends z.ZodType>({
    log,
    name,
    prompt,
    schema,
    system,
    temperature = 0.4,
  }: Ask<T>): Promise<z.output<T>> => {
    if (nebius === undefined) {
      throw notConfigured.nebius();
    }
    const trace = traces.getStore();
    const model = withTracing(nebius.chatModel(NEMOTRON_MODEL), posthog, {
      // Cloud Run throttles CPU after the response: send it now.
      posthogCaptureImmediate: true,
      posthogCostOverride: { inputCost: PRICE.input, outputCost: PRICE.output },
      posthogProperties: { $ai_span_name: name, environment },
      ...(trace && {
        posthogDistinctId: trace.distinctId,
        posthogTraceId: trace.traceId,
      }),
    });
    const agent = new Agent({ id: name, instructions: system, model, name });
    return await external(
      log,
      { operation: name, provider: "nebius" },
      async () => {
        const reply = await agent.generate(prompt, {
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          modelSettings: { temperature },
          structuredOutput: { schema },
        });
        if (reply.object === undefined || reply.object === null) {
          throw new Error("Nemotron returned no structured answer");
        }
        return schema.parse(reply.object);
      }
    );
  };
};

export type Nemotron = ReturnType<typeof createNemotron>;
