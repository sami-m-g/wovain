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

import { MODEL_ROLES } from "./model-router";
import type { ModelRole, ModelRouter } from "./model-router";
import { createScorers } from "./scorers";
import type { AnyScorer } from "./scorers";

// wovain's agents, one per model call (Mastra agents on Nemotron through
// Nebius's OpenAI-compatible API). Each carries its scorers, sampled live,
// its guardrails and, for the two that write for the merchant, memory of
// the merchant's brand and taste. The Mastra instance (packages/api) stores
// their scores, memory and traces in Postgres.

// The models are NEMOTRON_MODEL and NEMOTRON_VISION_MODEL (the judge's eyes,
// which read the drawn artwork in ./design inspectArtwork) in
// apps/web/.env.schema, set per environment through Pulumi config
// (infra/index.ts). Their list price is NEMOTRON_INPUT_PRICE and
// NEMOTRON_OUTPUT_PRICE (AgentKitConfig.pricePerMillion), NEMOTRON_MODEL's
// price: routed calls on other models carry no price override.
//
// With the model-routing flag on for the call (LlmTrace.routed, set by
// packages/api), each agent runs on the model for its job instead
// (AGENT_ROLES, ./model-router): the guardrails and scorers on the fast
// model and moderation on the safety model.
const TOKENS_PER_MILLION = 1_000_000;

export const AGENT_IDS = [
  "design_brief",
  "design_judge",
  "design_vision",
  "ad_copy",
  "ad_judge",
  "autopilot_pick_idea",
  "autopilot_review_design",
  "brand_proxies",
  "research_themes",
  "ads_optimizer_review",
  "voice_intent",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

// Which job each agent does, so which Nemotron model it runs on when routed:
// - default: what the merchant publishes (briefs, ad copy) and research.
// - reasoning: verdicts (the design judge, autopilot's go/no-go).
// - vision: looking at the drawn PNG.
// - fast: short binary checks (the ad judges).
export const AGENT_ROLES = {
  ad_copy: "default",
  ad_judge: "fast",
  ads_optimizer_review: "reasoning",
  autopilot_pick_idea: "reasoning",
  autopilot_review_design: "reasoning",
  // Reads web results for a brand reference and names Qloo-searchable
  // proxies: research, on the default model.
  brand_proxies: "default",
  design_brief: "default",
  design_judge: "reasoning",
  design_vision: "vision",
  research_themes: "default",
  // Maps a spoken command, in any of the app's languages, to one action.
  voice_intent: "default",
} as const satisfies Record<AgentId, ModelRole>;

// The agents that read images, on the vision model.
const SEEING: ReadonlySet<AgentId> = new Set(["design_vision"]);

// The agents that weigh evidence before an action: on their job's model
// (reasoning, NEMOTRON_MODEL_REASONING, ./model-router) even when the call
// isn't routed.
const REASONING: ReadonlySet<AgentId> = new Set(["ads_optimizer_review"]);

// The two agents that write for the merchant read their brand and taste.
export const REMEMBERING: ReadonlySet<AgentId> = new Set([
  "ad_copy",
  "design_brief",
]);

// The agents that read what the merchant said aloud (./voice): PostHog gets
// no input or output from their calls (privacy mode), and their Mastra
// traces hide both (./nemotron).
export const PRIVATE: ReadonlySet<AgentId> = new Set(["voice_intent"]);

// Request-context keys a call sets for tracing and routing (./nemotron).
export const TRACE_KEYS = {
  distinctId: "distinctId",
  routed: "modelRouting",
  traceId: "traceId",
};

const isRouted = (requestContext: RequestContext | undefined) =>
  requestContext?.get(TRACE_KEYS.routed) === true;

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
  // The Nebius model ID every agent, scorer and guardrail calls.
  model: string;
  // The Nebius model ID the agents that read images call.
  visionModel: string;
  // The model per job, for calls the model-routing flag routes.
  router?: ModelRouter | undefined;
  posthogHost: string;
  posthogKey?: string | undefined;
  // The model's list price, USD per million tokens (NEMOTRON_*_PRICE), for
  // PostHog's LLM cost.
  pricePerMillion: { input: number; output: number };
  // Share of live calls the scorers judge (0 to 1).
  scoreSampleRate?: number | undefined;
}

const HTTPS_URL = /^https:\/\/.+$/u;

export const createAgentKit = ({
  apiKey,
  baseURL,
  environment,
  guardrails = true,
  guardThresholds,
  memory,
  model,
  posthogHost,
  posthogKey,
  pricePerMillion,
  router,
  scoreSampleRate = 0.1,
  visionModel,
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
  const base = nebius.chatModel(model);
  // Nebius fetches the artwork from its https URL itself, so the AI SDK
  // passes the URL through: a 2880 px PNG isn't downloaded and inlined, and
  // an image Nebius can't fetch fails the call instead of being replaced by
  // a placeholder the model never sees.
  const seeing = createOpenAICompatible({
    apiKey,
    baseURL,
    name: "nebius",
    supportedUrls: () => ({ "image/*": [HTTPS_URL] }),
    supportsStructuredOutputs: true,
  });
  const vision = seeing.chatModel(visionModel);
  // The model ID an agent calls: its job's model when the call is routed,
  // else the one model (or the vision model for the agents that see).
  const modelFor = (id: AgentId, routed: boolean) => {
    if (routed && router !== undefined) {
      return router.modelFor(AGENT_ROLES[id]);
    }
    return SEEING.has(id) ? visionModel : model;
  };
  // Routed models, one per role, all able to read image URLs.
  const roleModel = (role: ModelRole) =>
    router === undefined ? base : seeing.chatModel(router.modelFor(role));
  const routedModels = Object.fromEntries(
    MODEL_ROLES.map((role) => [role, roleModel(role)])
  ) as Record<ModelRole, ReturnType<typeof roleModel>>;
  const modelOf = (id: AgentId, routed: boolean) => {
    if (routed && router !== undefined) {
      return routedModels[AGENT_ROLES[id]];
    }
    return SEEING.has(id) ? vision : base;
  };
  const posthog = new PostHog(posthogKey ?? "off", {
    disabled: posthogKey === undefined,
    host: posthogHost,
  });
  // Each call's model is wrapped for PostHog LLM analytics with the call's
  // merchant and run: $ai_generation with $ai_trace_id = the run's ID.
  const tracedModel =
    (span: AgentId) =>
    ({ requestContext }: { requestContext: RequestContext }) => {
      const distinctId = requestContext.get(TRACE_KEYS.distinctId);
      const traceId = requestContext.get(TRACE_KEYS.traceId);
      const routed = isRouted(requestContext) || REASONING.has(span);
      // The list price is NEMOTRON_MODEL's. A routed call on another model
      // (Ultra, Lightning) sends no override, so PostHog prices it from its
      // own model table instead of at the wrong model's price.
      const priced = !routed || modelFor(span, true) === model;
      return withTracing(modelOf(span, routed), posthog, {
        // Cloud Run throttles CPU after the response: send it now.
        posthogCaptureImmediate: true,
        ...(priced && {
          posthogCostOverride: {
            inputCost: pricePerMillion.input / TOKENS_PER_MILLION,
            outputCost: pricePerMillion.output / TOKENS_PER_MILLION,
          },
        }),
        posthogPrivacyMode: PRIVATE.has(span),
        posthogProperties: {
          $ai_span_name: span,
          environment,
          ...(routed && { model_role: AGENT_ROLES[span] }),
        },
        ...(typeof distinctId === "string" && {
          posthogDistinctId: distinctId,
        }),
        ...(typeof traceId === "string" && { posthogTraceId: traceId }),
      });
    };
  const scorers = createScorers(base, scoreSampleRate);
  // Routed, the scorers judge on the fast model.
  const fastScorers =
    router === undefined
      ? scorers
      : createScorers(routedModels.fast, scoreSampleRate);
  // Web text inside ideas is untrusted: injected instructions are blocked
  // and personal data redacted before the brief writer reads it. What the
  // merchant publishes is moderated and must carry no personal data.
  // Routed, the injection and PII checks run on the fast model and
  // moderation on the safety model.
  const guardsOn = (
    checks: MastraModelConfig,
    moderator: MastraModelConfig
  ) => ({
    injection: new PromptInjectionDetector({
      model: checks,
      strategy: "block",
      threshold: guardThresholds.injection,
    }),
    moderation: new ModerationProcessor({
      model: moderator,
      strategy: "block",
      threshold: guardThresholds.moderation,
    }),
    pii: new PIIDetector({
      model: checks,
      strategy: "block",
      threshold: guardThresholds.pii,
    }),
  });
  const guard = guardsOn(base, base);
  const routedGuard =
    router === undefined
      ? guard
      : guardsOn(routedModels.fast, routedModels.safety);
  const guardsOf = (set: typeof guard) => ({
    ad_copy: { input: [], output: [set.moderation, set.pii] },
    design_brief: { input: [set.injection], output: [set.moderation] },
  });
  const guarded = { legacy: guardsOf(guard), routed: guardsOf(routedGuard) };
  const guardsFor = (id: AgentId) => {
    if (!guardrails || !(id === "ad_copy" || id === "design_brief")) {
      return {};
    }
    const legacy = guarded.legacy[id];
    const routed = guarded.routed[id];
    const pick = ({ requestContext }: { requestContext?: RequestContext }) =>
      isRouted(requestContext) ? routed : legacy;
    return {
      inputProcessors: (context: { requestContext?: RequestContext }) =>
        pick(context).input,
      outputProcessors: (context: { requestContext?: RequestContext }) =>
        pick(context).output,
    };
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
        scorers: ({ requestContext }: { requestContext?: RequestContext }) =>
          (isRouted(requestContext) ? fastScorers : scorers).forAgent(id),
        ...(memory !== undefined && REMEMBERING.has(id) && { memory }),
        ...guardsFor(id),
      }),
    ])
  ) as Record<AgentId, Agent>;
  return { agents, model: base, modelFor, scorers: scorers.all };
};

export interface AgentKit {
  agents: Record<AgentId, Agent>;
  // The judges' model (no PostHog wrapper: scoring isn't a merchant call).
  model: MastraModelConfig;
  // The model ID an agent calls, routed by job or not.
  modelFor: (id: AgentId, routed: boolean) => string;
  scorers: Record<string, AnyScorer>;
}
