import path from "node:path";

import { z } from "zod";

// Keys are optional at startup: each tool checks the ones it needs and returns a
// user-safe error when one is missing, so the Settings widget works on day one.
// Sign-in (/mcp) turns every caller away until both WorkOS keys are set.
const envSchema = z
  .object({
    FAL_KEY: z.string().optional(),
    // Optional: a Fourthwall Platform App's HMAC key, for webhooks signed
    // with X-Fourthwall-Hmac-Apps-SHA256 (docs/changes/25-optimizer).
    FOURTHWALL_APP_HMAC_KEY: z.string().optional(),
    // Optional: wovain's own Meta app (Business type, Ads MCP use case), the
    // client merchants connect Meta through. Meta has no DCR or CIMD for its
    // Ads MCP, so the app ID is the OAuth client ID; the secret signs Graph
    // calls (appsecret_proof). Without the ID, Meta can't be connected.
    META_APP_ID: z.string().regex(/^\d+$/u).optional(),
    META_APP_SECRET: z.string().optional(),
    // Optional: what Meta must echo to subscribe /webhooks/meta. Meta
    // webhooks are signed with META_APP_SECRET; without it they're refused.
    META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    // Optional: Nebius Token Factory, for judge_design (Genkit, Nemotron);
    // without it the tool says the check isn't set up.
    NEBIUS_API_KEY: z.string().optional(),
    OPTIMIZER_CUSTOMER_KEY: z.string().min(32).optional(),
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
    // The optimizer's operator switch: "off" skips its model steps; event
    // intake and the code rules still run.
    WOVAIN_OPTIMIZER: z.enum(["on", "off"]).default("on"),
    // Every event inside one window leads to one optimizer run.
    WOVAIN_OPTIMIZER_DEBOUNCE_SECONDS: z.coerce
      .number()
      .int()
      .min(10)
      .max(3600)
      .default(120),
    // The Cloud Tasks queue (projects/…/queues/optimizer, infra/tasks.ts).
    // Unset: tasks run in this process (`pnpm dev`, tests).
    WOVAIN_OPTIMIZER_QUEUE: z.string().optional(),
    // The public origin ChatGPT reaches: the App Hosting URL (apphosting.yaml),
    // a tunnel, or localhost. MCP tokens are bound to `${site}/mcp`, so the
    // trailing slash goes.
    WOVAIN_SITE_URL: z
      .url()
      .default("http://localhost:3000")
      .transform((url) => url.replace(/\/$/u, "")),
    // The account Cloud Tasks call /tasks/* as; its OIDC token is checked.
    // Unset: every /tasks/* call is refused.
    WOVAIN_TASKS_SERVICE_ACCOUNT: z.email().optional(),
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
