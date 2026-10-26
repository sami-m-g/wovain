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
  FAL_KEY?: string | undefined;
  META_APP_ID?: string | undefined;
  META_APP_SECRET?: string | undefined;
  NEBIUS_API_KEY?: string | undefined;
  NEBIUS_BASE_URL: string;
  NEXT_PUBLIC_POSTHOG_HOST: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string | undefined;
  QLOO_API_KEY?: string | undefined;
  QLOO_API_URL: string;
  TAVILY_API_KEY?: string | undefined;
  TOKEN_ENCRYPTION_KEY: string;
  WOVAIN_ALLOWED_EMAILS?: string | undefined;
}

export const createCore = (env: CoreConfig) => ({
  artist: createArtist(env.FAL_KEY),
  // GitLab feature flags (./flags.ts), typed by ./flag-registry.ts.
  flags: createFlags(env),
  nemotron: createNemotron({
    apiKey: env.NEBIUS_API_KEY,
    baseURL: env.NEBIUS_BASE_URL,
    environment:
      new URL(env.BETTER_AUTH_URL).hostname === "wovain.com"
        ? "production"
        : "development",
    posthogHost: env.NEXT_PUBLIC_POSTHOG_HOST,
    posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY,
  }),
  sealer: createSealer(env.TOKEN_ENCRYPTION_KEY),
  // The team's emails, lowercased (WOVAIN_ALLOWED_EMAILS): flag targeting
  // only (the internal-only list), never an entitlement.
  team: new Set(
    (env.WOVAIN_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== "")
  ),
  trends: createTrends(
    tavilyClient(env.TAVILY_API_KEY),
    createQloo({ apiKey: env.QLOO_API_KEY, baseURL: env.QLOO_API_URL })
  ),
  upstream: createUpstream({
    appUrl: env.BETTER_AUTH_URL,
    metaAppId: env.META_APP_ID,
    metaAppSecret: env.META_APP_SECRET,
  }),
});

export type Core = ReturnType<typeof createCore>;
