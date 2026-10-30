import type { MastraDBMessage } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { unsupportedClaims } from "@wovain/core/grounding";
import { external, notConfigured } from "@wovain/core/log";
import type { Logger } from "@wovain/core/log";
import { currentLlmTrace } from "@wovain/core/nemotron";
import type { Ask } from "@wovain/core/nemotron";
import { createError, log as evlog } from "evlog";
import type { z } from "zod";

import { PRIVATE, REMEMBERING, TRACE_KEYS } from "./kit";
import type { AgentKit } from "./kit";

// wovain's own model calls (design briefs, the design judge, ad copy and
// autopilot's decisions) all go through `ask`, which runs the named Mastra
// agent (./agents) and returns schema-checked JSON. Inside a run, the call
// carries the run: PostHog groups its $ai_generation under the run's ID,
// Mastra's trace takes the run's ID, and the agents that write for the
// merchant read and keep the merchant's memory.

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

// An answer stated numbers or claims no tool gave the agent, twice.
const ungrounded = (agent: string, unsupported: string[]) =>
  createError({
    code: "UNGROUNDED_CLAIM",
    fix: "Retry; if it repeats, the research didn't back what the copy wanted to say.",
    message: `${agent} stated what no tool produced: ${unsupported.join(", ")}`,
    status: 422,
    why: "Every number and claim in buyer-facing text must come from a tool result.",
  });

// Memory failed; the call goes on without it and the failure is logged.
const memoryUnavailable = (
  log: Logger | undefined,
  agent: string,
  failed: string,
  error: unknown
) => {
  const memory = {
    agent,
    failed,
    reason: error instanceof Error ? error.message : String(error),
  };
  log?.set({ memory });
  // The error as a record (code, message, stack), so PostHog groups it by
  // its code and keeps the stack (apps/web/src/lib/error-tracking.ts).
  evlog.error({
    error: {
      code: "MASTRA_MEMORY_UNAVAILABLE",
      message: memory.reason,
      ...(error instanceof Error && { name: error.name, stack: error.stack }),
    },
    memory,
  });
};

// Mastra's structured-output check failed: the model's JSON missed the
// schema (an empty list where one item is required, a blank field). The
// MastraError in the error or its causes; undefined for any other failure.
const SHAPE_ERROR_ID = "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED";
const shapeErrorOf = (error: unknown): Error | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSES; depth += 1) {
    if (!(current instanceof Error)) {
      return undefined;
    }
    const { code, id = code } = current as Error & {
      code?: unknown;
      id?: unknown;
    };
    if (id === SHAPE_ERROR_ID) {
      return current;
    }
    current = current.cause;
  }
  return undefined;
};

const SHAPE_RULE =
  "Your last answer did not match the JSON schema. Fill every required field and list; it failed with:";

// A misshapen reply is asked again; the failure still goes to PostHog.
const shapeRetried = (log: Logger | undefined, agent: string, error: Error) => {
  log?.set({ shapeRetry: { agent } });
  evlog.error({
    error: {
      code: SHAPE_ERROR_ID,
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
    shapeRetry: { agent },
  });
};

// The messages a call added (its input and its answer), without the
// history it read from memory: what memory would have saved.
const newMessages = (reply: {
  messages: MastraDBMessage[];
  rememberedMessages: MastraDBMessage[];
}) => {
  const read = new Set(reply.rememberedMessages.map((message) => message.id));
  return reply.messages.filter(
    (message) => !read.has(message.id) && message.role !== "system"
  );
};

const GROUND_RULE =
  "Only state numbers and claims that appear in the input. Leave these out:";

// A PII-free summary of a call's input for the decision trace: the input's
// top-level fields (never their values) and how many images it shows.
const fieldsOf = (prompt: string) => {
  try {
    const parsed: unknown = JSON.parse(prompt);
    return typeof parsed === "object" && parsed !== null
      ? Object.keys(parsed).join(", ")
      : "text";
  } catch {
    // Plain text, not JSON.
    return "text";
  }
};
const summaryOf = (prompt: string, images: readonly string[]) =>
  `input: ${fieldsOf(prompt)}${images.length === 0 ? "" : `; ${images.length} image(s)`}`;

export const createNemotron =
  (kit: AgentKit | undefined) =>
  async <T extends z.ZodType>({
    grounded,
    images = [],
    log,
    name,
    prompt,
    schema,
    system,
    temperature = 0.4,
    timeoutMs,
  }: Ask<T>): Promise<z.output<T>> => {
    if (kit === undefined) {
      throw notConfigured.nebius();
    }
    // One budget for every attempt of a call the merchant waits on.
    const budget =
      timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs);
    const trace = currentLlmTrace();
    const routed = trace?.routed === true;
    const requestContext = new RequestContext(
      trace === undefined
        ? []
        : [
            [TRACE_KEYS.distinctId, trace.distinctId],
            [TRACE_KEYS.traceId, trace.traceId],
            [TRACE_KEYS.routed, routed],
          ]
    );
    // Mastra trace IDs are 32 hex characters: a run's UUID without dashes.
    const traceId = trace?.traceId.replaceAll("-", "");
    const input =
      images.length === 0
        ? prompt
        : [
            {
              content: [
                ...images.map((image) => ({
                  image: new URL(image),
                  mimeType: "image/png",
                  type: "image" as const,
                })),
                { text: prompt, type: "text" as const },
              ],
              role: "user" as const,
            },
          ];
    // The grounding guard runs on this call: an answer may be sent back.
    const guarded = routed && grounded !== undefined;
    const remember = trace !== undefined && REMEMBERING.has(name);
    // A guarded call reads its memory but keeps none of its attempts; only
    // the answer the guard accepts is saved (keep), so a rejected answer
    // never comes back as history in a later call of the run.
    let accepted: MastraDBMessage[] = [];
    const answer = async (instructions: string) =>
      await external(log, { operation: name, provider: "nebius" }, async () => {
        const send = async (withMemory: boolean, rules: string) =>
          await kit.agents[name].generate(input, {
            abortSignal: budget ?? AbortSignal.timeout(TIMEOUT_MS),
            instructions: rules,
            modelSettings: { temperature },
            requestContext,
            structuredOutput: { schema },
            ...(withMemory &&
              trace !== undefined && {
                memory: {
                  resource: trace.distinctId,
                  thread: trace.traceId,
                  ...(guarded && { options: { readOnly: true } }),
                },
              }),
            tracingOptions: {
              // The merchant's spoken words stay out of every trace.
              ...(PRIVATE.has(name) && { hideInput: true, hideOutput: true }),
              metadata: {
                runId: trace?.traceId,
                userId: trace?.distinctId,
              },
              ...(traceId !== undefined && HEX_ID.test(traceId) && { traceId }),
            },
          });
        // A reply that misses the schema (an empty list, a blank field) is
        // asked once more, naming what failed, before the call fails.
        const generate = async (withMemory: boolean) => {
          try {
            return await send(withMemory, instructions);
          } catch (error) {
            const failed = shapeErrorOf(error);
            if (failed === undefined) {
              throw error;
            }
            shapeRetried(log, name, failed);
            return await send(
              withMemory,
              `${instructions}\n\n${SHAPE_RULE} ${failed.message}`
            );
          }
        };
        let reply: Awaited<ReturnType<typeof generate>>;
        let keepable = remember && guarded;
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
          memoryUnavailable(log, name, failedStore, error);
          keepable = false;
          reply = await generate(false);
        }
        if (reply.tripwire !== undefined) {
          throw blocked(name, reply.tripwire.reason);
        }
        if (reply.object === undefined || reply.object === null) {
          throw new Error("Nemotron returned no structured answer");
        }
        accepted = keepable ? newMessages(reply) : [];
        return schema.parse(reply.object) as z.output<T>;
      });
    // Saves the accepted answer's exchange to the merchant's memory.
    const keep = async () => {
      if (trace === undefined || accepted.length === 0) {
        return;
      }
      try {
        const memory = await kit.agents[name].getMemory();
        await memory?.saveMessages({
          messages: accepted.map((message) => ({
            ...message,
            resourceId: trace.distinctId,
            threadId: trace.traceId,
          })),
        });
      } catch (error) {
        memoryUnavailable(log, name, storageErrorOf(error) ?? "save", error);
      }
    };
    const decisions = trace?.decisions;
    const call = async (instructions: string): Promise<z.output<T>> => {
      if (decisions === undefined) {
        return await answer(instructions);
      }
      const model = kit.modelFor(name, routed);
      return await decisions.call(
        {
          agent: name,
          inputSummary: summaryOf(prompt, images),
          model,
          step: name,
        },
        async () => await answer(instructions),
        (output) => ({
          output,
          sources: [{ provider: "nebius", title: model }],
        })
      );
    };
    const first = await call(system);
    if (!routed || grounded === undefined) {
      return first;
    }
    // The grounding guard: a number or claim the prompt (the tools'
    // results) doesn't hold sends the answer back once, naming them.
    const check = (reply: z.output<T>) => {
      const unsupported = unsupportedClaims(grounded(reply), prompt);
      decisions?.add({
        agent: "grounding_guard",
        inputSummary: `${name} answer`,
        ok: unsupported.length === 0,
        output: { unsupported },
        sources: [{ provider: "rule", title: "numbers and claims from tools" }],
        step: name,
      });
      return unsupported;
    };
    const unsupported = check(first);
    if (unsupported.length === 0) {
      await keep();
      return first;
    }
    const second = await call(
      `${system}\n\n${GROUND_RULE} ${unsupported.join(", ")}.`
    );
    const still = check(second);
    if (still.length > 0) {
      throw ungrounded(name, still);
    }
    await keep();
    return second;
  };
