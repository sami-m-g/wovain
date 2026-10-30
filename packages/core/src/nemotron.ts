import { AsyncLocalStorage } from "node:async_hooks";

import type { z } from "zod";

import type { AgentId } from "./agents";
import type { Logger } from "./log";
import type { DecisionTrace } from "./trace";

// The model-call port: what domain code needs to ask a model, with no
// framework behind it. @wovain/mastra implements `Nemotron` with Mastra
// agents (agents/ask) and passes it in through its composition root.

export interface LlmTrace {
  // Records every agent call (packages/api saves it as the decision trace).
  decisions?: DecisionTrace | undefined;
  distinctId: string;
  // The model-routing flag, evaluated for this merchant: each agent runs on
  // its job's model (./agents AGENT_ROLES) and the grounding guard is on.
  routed?: boolean | undefined;
  traceId: string;
}
const traces = new AsyncLocalStorage<LlmTrace>();
// Every Nemotron call inside `run` belongs to this run's trace.
export const withLlmTrace = async <T>(
  trace: LlmTrace,
  run: () => Promise<T>
): Promise<T> => await traces.run(trace, run);

// The decision trace of the call in progress, so a non-model step (a Tavily
// search) can record itself next to the agent calls; undefined outside a
// traced call or with model routing off.
export const currentDecisions = (): DecisionTrace | undefined =>
  traces.getStore()?.decisions;

export interface Ask<T extends z.ZodType> {
  // The text of the answer a buyer reads. When routed, every number and
  // claim in it must appear in the prompt (./grounding).
  grounded?: ((reply: z.output<T>) => string) | undefined;
  // https image URLs the agent looks at with the prompt (a vision agent).
  images?: readonly string[] | undefined;
  log?: Logger | undefined;
  // The agent that answers; it names the call in logs and in PostHog.
  name: AgentId;
  prompt: string;
  schema: T;
  system: string;
  temperature?: number;
}

// The trace of the call in progress, for the implementation of `ask`.
export const currentLlmTrace = (): LlmTrace | undefined => traces.getStore();

// Asks the named agent and returns its schema-checked answer.
export type Nemotron = <T extends z.ZodType>(
  ask: Ask<T>
) => Promise<z.output<T>>;
