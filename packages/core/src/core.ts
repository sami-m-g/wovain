import type { Memory } from "@mastra/memory";

import { createAgentKit } from "./agents";
import { createArtist } from "./fal";
import { createFlags } from "./flags";
import type { FlagsConfig } from "./flags";
import { createNemotron } from "./nemotron";
import { createQloo } from "./qloo";
import { createSealer } from "./sealing";
import { createTrends, tavilyClient } from "./trends";
import { createUpstream } from "./upstream";

// Everything the seller flow calls out to, built once per server process
// from the app's environment. A missing API key only fails the feature that
// needs it, with a NOT_CONFIGURED error naming the variable.
export interface CoreConfig extends FlagsConfig {
  BETTER_AUTH_URL: string;
  // Guardrail processors on model inputs and outputs ("off" to skip them).
  GUARDRAILS?: "off" | "on" | undefined;
  META_APP_ID?: string | undefined;
  META_APP_SECRET?: string | undefined;
  NEBIUS_API_KEY?: string | undefined;
  NEBIUS_BASE_URL: string;
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
  const agents = createAgentKit({
    apiKey: env.NEBIUS_API_KEY,
    baseURL: env.NEBIUS_BASE_URL,
    environment:
      new URL(env.BETTER_AUTH_URL).hostname === "wovain.com"
        ? "production"
        : "development",
    guardrails: env.GUARDRAILS !== "off",
    memory,
    posthogHost: env.NEXT_PUBLIC_POSTHOG_HOST,
    posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
    scoreSampleRate: env.SCORER_SAMPLE_RATE,
  });
  const nemotron = createNemotron(agents);
  return {
    // The Mastra agents and scorers, registered on the app's Mastra
    // instance; undefined without a Nebius key.
    agents,
    // fal runs on the merchant's own fal account (an MCP grant), never on
    // wovain's.
    artist: createArtist,
    // PostHog feature flags (./flags.ts), typed by ./flag-registry.ts.
    flags: createFlags(env),
    memory,
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
    }),
  };
};

export type Core = ReturnType<typeof createCore>;
