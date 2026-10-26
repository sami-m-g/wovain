import { createBilling } from "@wovain/billing/service";
import { createCore } from "@wovain/core/core";
import { createMerchantMemory } from "@wovain/core/taste";
import { createDb } from "@wovain/db";
import { createMailer } from "@wovain/email/mailer";
import { Inngest } from "inngest";
import { z } from "zod";

import { createMastra, INNGEST_APP_ID } from "../workflows/engine";
import { createMastraStorage } from "../workflows/storage";

// Mastra Studio's entry (`pnpm --filter @wovain/api studio`, AGENTS.md): the
// same agents, scorers, memory, workflow and storage as the app, built from
// the environment, for local inspection only. The app builds its instance
// in apps/web/src/services.ts.

const env = z
  .object({
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1),
    GUARDRAILS: z.enum(["on", "off"]).default("on"),
    NEBIUS_API_KEY: z.string().optional(),
    NEBIUS_BASE_URL: z.url().default("https://api.tokenfactory.nebius.com/v1/"),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    QLOO_API_KEY: z.string().optional(),
    QLOO_API_URL: z.url().default("https://hackathon.api.qloo.com"),
    SCORER_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
    TAVILY_API_KEY: z.string().optional(),
    TOKEN_ENCRYPTION_KEY: z.string().min(44),
  })
  .parse(process.env);

const db = createDb(env);
const { storage } = createMastraStorage(db.$client);

export const mastra = createMastra({
  cloudTrace: false,
  inngest: new Inngest({ id: INNGEST_APP_ID }),
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
      from: "wovain <hello@wovain.com>",
      siteUrl: env.BETTER_AUTH_URL,
    }),
  },
  storage,
});
