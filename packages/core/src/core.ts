import type { Memory } from "@mastra/memory";

import { createAgentKit } from "./agents";
import { createArtist } from "./fal";
import { createFlags } from "./flags";
import type { FlagsConfig } from "./flags";
import { createModelRouter } from "./model-router";
import type { ModelRouterConfig } from "./model-router";
import { createNemotron } from "./nemotron";
import { createQloo } from "./qloo";
import { createSealer } from "./sealing";
import { createTrends, tavilyClient } from "./trends";
import { createUpstream } from "./upstream";
import type { ToolCall } from "./upstream";

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
  NEXT_PUBLIC_POSTHOG_HOST: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string | undefined;
  QLOO_API_KEY?: string | undefined;
  QLOO_API_URL: string;
  // Share of live model calls the scorers judge, 0 to 1.
  SCORER_SAMPLE_RATE?: number | undefined;
  TAVILY_API_KEY?: string | undefined;
  TOKEN_ENCRYPTION_KEY: string;
}

export const createCore = (
  env: CoreConfig,
  // The merchants' memory (./taste), when the app has Mastra storage.
  { memory }: { memory?: Memory | undefined } = {}
) => {
  const models = createModelRouter(env);
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
  return {
    // The Mastra agents and scorers, registered on the app's Mastra
    // instance; undefined without a Nebius key.
    agents,
    // fal runs on the merchant's own fal account (an MCP grant), never on
    // wovain's.
    artist: (call: ToolCall) =>
      createArtist(call, { model: env.FAL_IMAGE_MODEL }),
    // The blank pickBlank falls back to (./fourthwall.ts).
    defaultCatalogProductId: env.FOURTHWALL_DEFAULT_PRODUCT_ID,
    // PostHog feature flags (./flags.ts), typed by ./flag-registry.ts.
    flags: createFlags(env),
    memory,
    // The model ID, for analytics events (packages/api/src/flow).
    model: env.NEMOTRON_MODEL,
    // The Nemotron model per job (fast, default, reasoning, vision,
    // safety), from NEMOTRON_MODEL_* (./model-router.ts).
    models,
    nemotron,
    sealer: createSealer(env.TOKEN_ENCRYPTION_KEY),
    trends: createTrends(
      tavilyClient(env.TAVILY_API_KEY),
      createQloo({ apiKey: env.QLOO_API_KEY, baseURL: env.QLOO_API_URL }),
      // Without a Nebius key, research themes fall back to design angles.
      agents === undefined ? undefined : nemotron
    ),
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
