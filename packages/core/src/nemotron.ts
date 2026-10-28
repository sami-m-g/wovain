import { AsyncLocalStorage } from "node:async_hooks";

import { RequestContext } from "@mastra/core/request-context";
import { createError, log as evlog } from "evlog";
import type { z } from "zod";

import { REMEMBERING, TRACE_KEYS } from "./agents";
import type { AgentId, AgentKit } from "./agents";
import { external, notConfigured } from "./log";
import type { Logger } from "./log";

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

// The ID of a Mastra storage error (a MastraError in the STORAGE domain,
// e.g. MASTRA_STORAGE_PG_GET_THREAD_BY_ID_FAILED) in the error or its
// causes; undefined for any other failure.
const STORAGE_ERROR_ID = /^MASTRA_STORAGE_/u;
const MAX_CAUSES = 5;
const storageErrorOf = (error: unknown): string | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (!(current instanceof Error)) {
      return undefined;
    }
    // A MastraError carries `id`; once Mastra serializes it as a cause, the
    // same ID reads `code`.
    const {
      code,
      domain,
      id = code,
    } = current as Error & { code?: unknown; domain?: unknown; id?: unknown };
    if (
      typeof id === "string" &&
      (domain === "STORAGE" || STORAGE_ERROR_ID.test(id))
    ) {
      return id;
    }
    current = current.cause;
  }
  return undefined;
};

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
        const generate = async (remember: boolean) =>
          await kit.agents[name].generate(prompt, {
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
            instructions: system,
            modelSettings: { temperature },
            requestContext,
            structuredOutput: { schema },
            ...(remember &&
              trace !== undefined && {
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
        const remember = trace !== undefined && REMEMBERING.has(name);
        let reply: Awaited<ReturnType<typeof generate>>;
        try {
          reply = await generate(remember);
        } catch (error) {
          // Memory is a nicety: when Mastra's store fails (its schema
          // missing, Postgres down), the call runs again without memory
          // and the failure goes to the logs (and to PostHog through the
          // drain).
          const failedStore = remember ? storageErrorOf(error) : undefined;
          if (failedStore === undefined) {
            throw error;
          }
          const memory = {
            agent: name,
            failed: failedStore,
            reason: error instanceof Error ? error.message : String(error),
          };
          log?.set({ memory });
          evlog.error({ error: "MASTRA_MEMORY_UNAVAILABLE", memory });
          reply = await generate(false);
        }
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
