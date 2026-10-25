import path from "node:path";

import { z } from "zod";

// Keys are optional at startup: each tool checks the ones it needs and returns a
// user-safe error when one is missing, so the Settings widget works on day one.
// Sign-in (/mcp) turns every caller away until both WorkOS keys are set.
const envSchema = z
  .object({
    FAL_KEY: z.string().optional(),
    // Optional: wovain's own Meta app (Business type, Ads MCP use case), the
    // client merchants connect Meta through. Meta has no DCR or CIMD for its
    // Ads MCP, so the app ID is the OAuth client ID; the secret signs Graph
    // calls (appsecret_proof). Without the ID, Meta can't be connected.
    META_APP_ID: z.string().regex(/^\d+$/u).optional(),
    META_APP_SECRET: z.string().optional(),
    // Optional: Nebius Token Factory, for judge_design (Genkit, Nemotron);
    // without it the tool says the check isn't set up.
    NEBIUS_API_KEY: z.string().optional(),
    // Optional: Qloo's Taste API (hackathon host), for research_trends' taste
    // graph and suggest_audience; without it research uses the news alone and
    // suggest_audience says it isn't set up.
    QLOO_API_KEY: z.string().optional(),
    // Optional: Tavily search, for research_trends and screen_trademark;
    // without it both tools say they aren't set up.
    TAVILY_API_KEY: z.string().optional(),
    // Reads each caller's email for the allowlist.
    WORKOS_API_KEY: z.string().optional(),
    // The AuthKit domain that signs merchants in and issues /mcp's tokens.
    WORKOS_AUTHKIT_DOMAIN: z.url().optional(),
    // Comma-separated emails allowed to sign in. Until each merchant links their
    // own Meta and fal accounts, every signed-in user acts through the
    // operator's keys, so an empty list lets nobody in.
    WOVAIN_ALLOWED_EMAILS: z
      .string()
      .default("")
      .transform(
        (value) =>
          new Set(
            value
              .split(",")
              .map((email) => email.trim().toLowerCase())
              .filter((email) => email !== "")
          )
      ),
    // The operator's kill switch for autopilot: "off" refuses new runs and
    // decisions and stops a running run at its next paid job.
    WOVAIN_AUTOPILOT: z.enum(["on", "off"]).default("on"),
    // The wovain logo agents show for the connector (public/icon.png).
    WOVAIN_ICON_URL: z.url().optional(),
    // The Cloud KMS key that encrypts merchants' Fourthwall and fal grants
    // (infra/index.ts). Without it, connections work only on the emulators,
    // with a key that lives in memory.
    WOVAIN_KMS_KEY: z.string().optional(),
    // The public origin ChatGPT reaches: the App Hosting URL (apphosting.yaml),
    // a tunnel, or localhost. MCP tokens are bound to `${site}/mcp`, so the
    // trailing slash goes.
    WOVAIN_SITE_URL: z
      .url()
      .default("http://localhost:3000")
      .transform((url) => url.replace(/\/$/u, "")),
    // The built widgets beside this package: src/ in development and tests,
    // dist/ once built (`pnpm build`, which App Hosting runs before start).
    WOVAIN_WIDGETS_DIR: z
      .string()
      .default(() =>
        path.join(import.meta.dirname, "..", "..", "widgets", "dist")
      ),
  })
  .transform((env) => ({
    ...env,
    WOVAIN_ICON_URL: env.WOVAIN_ICON_URL ?? `${env.WOVAIN_SITE_URL}/icon.png`,
  }));

export type Env = z.infer<typeof envSchema>;

// `cp .env.example .env` leaves `KEY=` lines; treat those as unset.
export const loadEnv = (
  source: Record<string, string | undefined> = process.env
): Env =>
  envSchema.parse(
    Object.fromEntries(
      Object.entries(source).filter(([, value]) => value !== "")
    )
  );
