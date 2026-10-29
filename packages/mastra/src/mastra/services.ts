import type { Memory } from "@mastra/memory";
import { ART_MODELS_VAR, parseArtModels } from "@wovain/core/art";
import type { ArtModels } from "@wovain/core/art";
import { createSignals } from "@wovain/core/autopilot-signals";
import type { ResearchModel } from "@wovain/core/evidence";
import { createArtist, createFalJobs, falKeyCall } from "@wovain/core/fal";
import { createFlags } from "@wovain/core/flags";
import type { FlagsConfig } from "@wovain/core/flags";
import { createMetaGraph } from "@wovain/core/meta-graph";
import { createMetaInterests } from "@wovain/core/meta-interests";
import { createModelRouter } from "@wovain/core/model-router";
import type { ModelRouterConfig } from "@wovain/core/model-router";
import { createQloo } from "@wovain/core/qloo";
import { createSealer } from "@wovain/core/sealing";
import { createTrends, tavilyClient } from "@wovain/core/trends";
import { createUpstream } from "@wovain/core/upstream";
import type { ToolCall } from "@wovain/core/upstream";
import { createTranscriber } from "@wovain/core/voice";

import { createNemotron } from "./agents/ask";
import { createAgentKit } from "./agents/kit";

// Everything the seller flow calls out to, built once per server process
// from the app's environment. A missing API key only fails the feature that
// needs it, with a NOT_CONFIGURED error naming the variable.
export interface CoreConfig extends FlagsConfig, ModelRouterConfig {
  BETTER_AUTH_URL: string;
  // The providers' MCP servers (apps/web/.env.schema).
  FAL_MCP_URL: string;
  // The blank a Fourthwall catalog search that stays empty falls back to.
  FOURTHWALL_DEFAULT_PRODUCT_ID: string;
  FOURTHWALL_MCP_URL: string;
  // The guardrails' block thresholds, 0 to 1.
  GUARDRAIL_INJECTION_THRESHOLD: number;
  GUARDRAIL_MODERATION_THRESHOLD: number;
  GUARDRAIL_PII_THRESHOLD: number;
  // Guardrail processors on model inputs and outputs ("off" to skip them).
  GUARDRAILS?: "off" | "on" | undefined;
  META_APP_ID?: string | undefined;
  META_APP_SECRET?: string | undefined;
  // Meta's Graph API with its version, for interest search (./meta-interests).
  META_GRAPH_URL: string;
  META_MCP_SCOPE: string;
  META_MCP_URL: string;
  NEBIUS_API_KEY?: string | undefined;
  NEBIUS_BASE_URL: string;
  // Nemotron's list price, USD per million tokens, for LLM analytics.
  NEMOTRON_INPUT_PRICE: number;
  NEMOTRON_OUTPUT_PRICE: number;
  // The Nebius model ID wovain's agents call (apps/web/.env.schema).
  NEMOTRON_MODEL: string;
  // The Nebius vision model the design judge reads the art with.
  NEMOTRON_VISION_MODEL: string;
  // The fal endpoint that draws the print art (apps/web/.env.schema).
  FAL_IMAGE_MODEL: string;
  // wovain's own fal key: it transcribes voice commands (./voice), and
  // designs draw on it, paid by credits, while the onboarding-wizard flag is
  // on (packages/api/src/flow/connections.ts). Voice commands fail without it.
  FAL_KEY?: string | undefined;
  NEXT_PUBLIC_POSTHOG_HOST: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string | undefined;
  QLOO_API_KEY?: string | undefined;
  QLOO_API_URL: string;
  // Share of live model calls the scorers judge, 0 to 1.
  SCORER_SAMPLE_RATE?: number | undefined;
  TAVILY_API_KEY?: string | undefined;
  // Tavily Research's model for idea dossiers (apps/web/.env.schema).
  TAVILY_RESEARCH_MODEL: ResearchModel;
  TOKEN_ENCRYPTION_KEY: string;
  // The fal speech-to-text endpoints for voice commands (./voice), the
  // fallback answering when the first fails.
  VOICE_STT_MODEL: string;
  VOICE_STT_FALLBACK_MODEL: string;
}

export const createCore = (
  env: CoreConfig,
  // The merchants' memory (./taste), when the app has Mastra storage.
  { memory }: { memory?: Memory | undefined } = {}
) => {
  const models = createModelRouter(env);
  // Tavily's search, extract and research, called live (./trends.ts,
  // ./evidence.ts).
  const tavily = tavilyClient(env.TAVILY_API_KEY);
  const agents = createAgentKit({
    apiKey: env.NEBIUS_API_KEY,
    baseURL: env.NEBIUS_BASE_URL,
    environment: env.APP_ENV ?? "development",
    guardThresholds: {
      injection: env.GUARDRAIL_INJECTION_THRESHOLD,
      moderation: env.GUARDRAIL_MODERATION_THRESHOLD,
      pii: env.GUARDRAIL_PII_THRESHOLD,
    },
    guardrails: env.GUARDRAILS !== "off",
    memory,
    model: env.NEMOTRON_MODEL,
    posthogHost: env.NEXT_PUBLIC_POSTHOG_HOST,
    posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
    pricePerMillion: {
      input: env.NEMOTRON_INPUT_PRICE,
      output: env.NEMOTRON_OUTPUT_PRICE,
    },
    router: models,
    scoreSampleRate: env.SCORER_SAMPLE_RATE,
    visionModel: env.NEMOTRON_VISION_MODEL,
  });
  const nemotron = createNemotron(agents);
  const qloo = createQloo({
    apiKey: env.QLOO_API_KEY,
    baseURL: env.QLOO_API_URL,
  });
  return {
    // The Mastra agents and scorers, registered on the app's Mastra
    // instance; undefined without a Nebius key.
    agents,
    // A drop's fal models per art type (./art.ts): GPT Image draws the
    // graphics, FAL_ART_MODELS the rest. Read when a drop needs them, so a
    // missing value fails only drops, naming the variable.
    artModels: (): ArtModels => ({
      ...parseArtModels(process.env[ART_MODELS_VAR]),
      graphic: env.FAL_IMAGE_MODEL,
    }),
    // Draws on the merchant's own fal account (an MCP grant) or, while the
    // onboarding-wizard flag is on, on wovain's key (falKey).
    artist: (call: ToolCall) =>
      createArtist(call, { model: env.FAL_IMAGE_MODEL }),
    // The blank pickBlank falls back to (./fourthwall.ts).
    defaultCatalogProductId: env.FOURTHWALL_DEFAULT_PRODUCT_ID,
    // Any fal model as a keyed submit and a free re-read (./fal.ts).
    falJobs: (call: ToolCall) => createFalJobs(call),
    // fal on wovain's own key (FAL_KEY), a ToolCall the artist draws with;
    // undefined without the key.
    falKey:
      env.FAL_KEY === undefined || env.FAL_KEY === ""
        ? undefined
        : falKeyCall(env.FAL_KEY),
    // PostHog feature flags (./flags.ts), typed by ./flag-registry.ts.
    flags: createFlags(env),
    memory,
    // The Graph API with the merchant's own Meta grant (./meta-graph).
    metaGraph: createMetaGraph({ graphUrl: env.META_GRAPH_URL }),
    // Meta's interest search, with wovain's app token (./meta-interests).
    metaInterests: createMetaInterests({
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      graphUrl: env.META_GRAPH_URL,
    }),
    // The model ID, for analytics events (packages/api/src/flow).
    model: env.NEMOTRON_MODEL,
    // The Nemotron model per job (fast, default, reasoning, vision,
    // safety), from NEMOTRON_MODEL_* (./model-router.ts).
    models,
    nemotron,
    // Qloo's Taste API (./qloo.ts): trends, demographics and audiences,
    // and Tavily's search, which the brand wizard resolves references with
    // (./brand-identity.ts).
    qloo,
    // Tavily Research's model for idea dossiers (./evidence.ts).
    researchModel: env.TAVILY_RESEARCH_MODEL,
    sealer: createSealer(env.TOKEN_ENCRYPTION_KEY),
    // Autopilot's triggers: Qloo's rising brands and this week's news
    // (./autopilot-signals.ts).
    signals: createSignals({
      qloo: { apiKey: env.QLOO_API_KEY, baseURL: env.QLOO_API_URL },
      tavily,
    }),
    tavily,
    // Speech to text for voice commands, on wovain's fal key (./voice).
    transcriber: createTranscriber({
      apiKey: env.FAL_KEY,
      fallbackModel: env.VOICE_STT_FALLBACK_MODEL,
      model: env.VOICE_STT_MODEL,
    }),
    // Qloo names every theme; Tavily adds the evidence.
    trends: createTrends(tavily, qloo),
    upstream: createUpstream({
      appUrl: env.BETTER_AUTH_URL,
      metaAppId: env.META_APP_ID,
      metaAppSecret: env.META_APP_SECRET,
      metaScope: env.META_MCP_SCOPE,
      serverUrls: {
        fal: env.FAL_MCP_URL,
        fourthwall: env.FOURTHWALL_MCP_URL,
        meta: env.META_MCP_URL,
      },
    }),
  };
};

export type Core = ReturnType<typeof createCore>;
