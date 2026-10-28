import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import {
  ModerationProcessor,
  PIIDetector,
  PromptInjectionDetector,
} from "@mastra/core/processors";
import type { RequestContext } from "@mastra/core/request-context";
import type { Memory } from "@mastra/memory";
import { withTracing } from "@posthog/ai/vercel";
import { PostHog } from "posthog-node";

import { createScorers } from "./scorers";
import type { AnyScorer } from "./scorers";

// wovain's agents, one per model call (Mastra agents on Nemotron through
// Nebius's OpenAI-compatible API). Each carries its scorers, sampled live,
// its guardrails and, for the two that write for the merchant, memory of
// the merchant's brand and taste. The Mastra instance (packages/api) stores
// their scores, memory and traces in Postgres.

export const NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const TOKENS_PER_MILLION = 1_000_000;

export const AGENT_IDS = [
  "design_brief",
  "design_judge",
  "ad_copy",
  "autopilot_pick_idea",
  "autopilot_review_design",
  "research_themes",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

// The two agents that write for the merchant read their brand and taste.
export const REMEMBERING: ReadonlySet<AgentId> = new Set([
  "ad_copy",
  "design_brief",
]);

// Request-context keys a call sets for tracing (./nemotron).
export const TRACE_KEYS = { distinctId: "distinctId", traceId: "traceId" };

export interface AgentKitConfig {
  apiKey: string | undefined;
  baseURL: string;
  environment: string;
  // Guardrails on model inputs and outputs; on unless turned off.
  guardrails?: boolean | undefined;
  // The guardrails' block thresholds, 0 to 1 (GUARDRAIL_*_THRESHOLD).
  guardThresholds: { injection: number; moderation: number; pii: number };
  // Brand and taste memory per merchant; none without storage.
  memory?: Memory | undefined;
  posthogHost: string;
  posthogKey?: string | undefined;
  // The model's list price, USD per million tokens (NEMOTRON_*_PRICE), for
  // PostHog's LLM cost.
  pricePerMillion: { input: number; output: number };
  // Share of live calls the scorers judge (0 to 1).
  scoreSampleRate?: number | undefined;
}

export const createAgentKit = ({
  apiKey,
  baseURL,
  environment,
  guardrails = true,
  guardThresholds,
  memory,
  posthogHost,
  posthogKey,
  pricePerMillion,
  scoreSampleRate = 0.1,
}: AgentKitConfig): AgentKit | undefined => {
  if (apiKey === undefined) {
    return;
  }
  const nebius = createOpenAICompatible({
    apiKey,
    baseURL,
    name: "nebius",
    supportsStructuredOutputs: true,
  });
  const base = nebius.chatModel(NEMOTRON_MODEL);
  const posthog = new PostHog(posthogKey ?? "off", {
    disabled: posthogKey === undefined,
    host: posthogHost,
  });
  // Each call's model is wrapped for PostHog LLM analytics with the call's
  // merchant and run: $ai_generation with $ai_trace_id = the run's ID.
  const tracedModel =
    (span: string) =>
    ({ requestContext }: { requestContext: RequestContext }) => {
      const distinctId = requestContext.get(TRACE_KEYS.distinctId);
      const traceId = requestContext.get(TRACE_KEYS.traceId);
      return withTracing(base, posthog, {
        // Cloud Run throttles CPU after the response: send it now.
        posthogCaptureImmediate: true,
        posthogCostOverride: {
          inputCost: pricePerMillion.input / TOKENS_PER_MILLION,
          outputCost: pricePerMillion.output / TOKENS_PER_MILLION,
        },
        posthogProperties: { $ai_span_name: span, environment },
        ...(typeof distinctId === "string" && {
          posthogDistinctId: distinctId,
        }),
        ...(typeof traceId === "string" && { posthogTraceId: traceId }),
      });
    };
  const scorers = createScorers(base, scoreSampleRate);
  // Web text inside ideas is untrusted: injected instructions are blocked
  // and personal data redacted before the brief writer reads it. What the
  // merchant publishes is moderated and must carry no personal data.
  const guard = {
    injection: new PromptInjectionDetector({
      model: base,
      strategy: "block",
      threshold: guardThresholds.injection,
    }),
    moderation: new ModerationProcessor({
      model: base,
      strategy: "block",
      threshold: guardThresholds.moderation,
    }),
    pii: new PIIDetector({
      model: base,
      strategy: "block",
      threshold: guardThresholds.pii,
    }),
  };
  const guardsFor = (id: AgentId) => {
    if (!guardrails) {
      return {};
    }
    if (id === "design_brief") {
      return {
        inputProcessors: [guard.injection],
        outputProcessors: [guard.moderation],
      };
    }
    if (id === "ad_copy") {
      return { outputProcessors: [guard.moderation, guard.pii] };
    }
    return {};
  };
  const agents = Object.fromEntries(
    AGENT_IDS.map((id) => [
      id,
      new Agent({
        id,
        // Each call passes its own instructions (the prompt lives with the
        // step that owns it); these are the defaults Studio shows.
        instructions: `wovain ${id.replaceAll("_", " ")}: answer with JSON only.`,
        model: tracedModel(id),
        name: id,
        scorers: scorers.forAgent(id),
        ...(memory !== undefined && REMEMBERING.has(id) && { memory }),
        ...guardsFor(id),
      }),
    ])
  ) as Record<AgentId, Agent>;
  return { agents, model: base, scorers: scorers.all };
};

export interface AgentKit {
  agents: Record<AgentId, Agent>;
  // The judges' model (no PostHog wrapper: scoring isn't a merchant call).
  model: MastraModelConfig;
  scorers: Record<string, AnyScorer>;
}
