import { AsyncLocalStorage } from "node:async_hooks";

import { RequestContext } from "@mastra/core/request-context";
import { createError } from "evlog";
import type { z } from "zod";

import { REMEMBERING, TRACE_KEYS } from "./agents";
import type { AgentId, AgentKit } from "./agents";
import { external, notConfigured } from "./log";
import type { Logger } from "./log";

export { NEMOTRON_MODEL } from "./agents";

// wovain's own model calls (design briefs, the design judge, ad copy and
// autopilot's decisions) all go through `ask`, which runs the named Mastra
// agent (./agents) and returns schema-checked JSON. Inside a run, the call
// carries the run: PostHog groups its $ai_generation under the run's ID,
// Mastra's trace takes the run's ID, and the agents that write for the
// merchant read and keep the merchant's memory.

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

export interface Ask<T extends z.ZodType> {
  log?: Logger | undefined;
  // The agent that answers; it names the call in logs and in PostHog.
  name: AgentId;
  prompt: string;
  schema: T;
  system: string;
  temperature?: number;
}

const TIMEOUT_MS = 90_000;
const HEX_ID = /^[\da-f]{32}$/u;

// A guardrail stopped the call: the input or the answer broke a rule. It
// won't pass on a retry, so it fails the step with the reason.
const blocked = (agent: string, reason: string) =>
  createError({
    code: "GUARDRAIL_BLOCKED",
    fix: "Try another seed or idea; the research or the answer broke a content rule.",
    message: `A guardrail stopped ${agent}`,
    status: 422,
    why: reason,
  });

export const createNemotron =
  (kit: AgentKit | undefined) =>
  async <T extends z.ZodType>({
    log,
    name,
    prompt,
    schema,
    system,
    temperature = 0.4,
  }: Ask<T>): Promise<z.output<T>> => {
    if (kit === undefined) {
      throw notConfigured.nebius();
    }
    const trace = traces.getStore();
    const requestContext = new RequestContext(
      trace === undefined
        ? []
        : [
            [TRACE_KEYS.distinctId, trace.distinctId],
            [TRACE_KEYS.traceId, trace.traceId],
          ]
    );
    // Mastra trace IDs are 32 hex characters: a run's UUID without dashes.
    const traceId = trace?.traceId.replaceAll("-", "");
    return await external(
      log,
      { operation: name, provider: "nebius" },
      async () => {
        const reply = await kit.agents[name].generate(prompt, {
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          instructions: system,
          modelSettings: { temperature },
          requestContext,
          structuredOutput: { schema },
          ...(trace !== undefined &&
            REMEMBERING.has(name) && {
              memory: { resource: trace.distinctId, thread: trace.traceId },
            }),
          tracingOptions: {
            metadata: {
              runId: trace?.traceId,
              userId: trace?.distinctId,
            },
            ...(traceId !== undefined && HEX_ID.test(traceId) && { traceId }),
          },
        });
        if (reply.tripwire !== undefined) {
          throw blocked(name, reply.tripwire.reason);
        }
        if (reply.object === undefined || reply.object === null) {
          throw new Error("Nemotron returned no structured answer");
        }
        return schema.parse(reply.object);
      }
    );
  };

export type Nemotron = ReturnType<typeof createNemotron>;
