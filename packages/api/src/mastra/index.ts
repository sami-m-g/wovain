import { createBilling } from "@wovain/billing/service";
import { createCore } from "@wovain/core/core";
import { RESEARCH_MODELS } from "@wovain/core/evidence";
import { createMerchantMemory } from "@wovain/core/taste";
import { createDb } from "@wovain/db";
import { createMailer } from "@wovain/email/mailer";
import { Inngest } from "inngest";
import { z } from "zod";

import { createMastra, DEFAULT_INNGEST_APP_ID } from "../workflows/engine";
import { createMastraStorage } from "../workflows/storage";

// Mastra Studio's entry (`pnpm --filter @wovain/api studio`, AGENTS.md): the
// same agents, scorers, memory, workflow and storage as the app, built from
// the environment, for local inspection only. The app builds its instance
// in apps/web/src/services.ts. Per-environment settings have no defaults
// here either: set them as apps/web/.env.schema describes (BILLING_CATALOG
// and PRICING_RULES are read where they are used).

const env = z
  .object({
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    EMAIL_FROM: z.string().min(1),
    FAL_IMAGE_MODEL: z.string().min(1),
    FAL_KEY: z.string().optional(),
    FAL_MCP_URL: z.url(),
    FOURTHWALL_DEFAULT_PRODUCT_ID: z.string().min(1),
    FOURTHWALL_MCP_URL: z.url(),
    GUARDRAILS: z.enum(["on", "off"]).default("on"),
    GUARDRAIL_INJECTION_THRESHOLD: z.coerce.number().min(0).max(1),
    GUARDRAIL_MODERATION_THRESHOLD: z.coerce.number().min(0).max(1),
    GUARDRAIL_PII_THRESHOLD: z.coerce.number().min(0).max(1),
    INNGEST_APP_ID: z.string().min(1).default(DEFAULT_INNGEST_APP_ID),
    META_GRAPH_URL: z.url().default("https://graph.facebook.com/v26.0"),
    META_MCP_SCOPE: z.string().min(1),
    META_MCP_URL: z.url(),
    NEBIUS_API_KEY: z.string().optional(),
    NEBIUS_BASE_URL: z.url().default("https://api.tokenfactory.nebius.com/v1/"),
    NEMOTRON_INPUT_PRICE: z.coerce.number().nonnegative(),
    NEMOTRON_MODEL: z.string().min(1),
    NEMOTRON_MODEL_DEFAULT: z.string().min(1),
    NEMOTRON_MODEL_FAST: z.string().min(1),
    NEMOTRON_MODEL_REASONING: z.string().min(1),
    NEMOTRON_MODEL_SAFETY: z.string().min(1),
    NEMOTRON_MODEL_VISION: z.string().min(1),
    NEMOTRON_OUTPUT_PRICE: z.coerce.number().nonnegative(),
    NEMOTRON_VISION_MODEL: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    QLOO_API_KEY: z.string().optional(),
    QLOO_API_URL: z.url().default("https://hackathon.api.qloo.com"),
    SCORER_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
    TAVILY_API_KEY: z.string().optional(),
    TAVILY_RESEARCH_MODEL: z.enum(RESEARCH_MODELS),
    TOKEN_ENCRYPTION_KEY: z.string().min(44),
    VOICE_STT_FALLBACK_MODEL: z.string().min(1),
    VOICE_STT_MODEL: z.string().min(1),
  })
  .parse(process.env);

const db = createDb(env);
const { storage } = createMastraStorage(db.$client);

export const mastra = createMastra({
  cloudTrace: false,
  inngest: new Inngest({ id: env.INNGEST_APP_ID }),
  services: {
    // No Polar token: Studio never charges or checks out.
    billing: createBilling({
      BETTER_AUTH_URL: env.BETTER_AUTH_URL,
      POLAR_ENVIRONMENT: "sandbox",
    }),
    core: createCore(env, { memory: createMerchantMemory(storage) }),
    db,
    mailer: createMailer({
      apiKey: undefined,
      from: env.EMAIL_FROM,
      replyTo: "support@wovain.com",
      siteUrl: env.BETTER_AUTH_URL,
    }),
  },
  storage,
});
