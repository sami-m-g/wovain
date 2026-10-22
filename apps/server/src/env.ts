import path from "node:path";

import { z } from "zod";

// Keys are optional at startup: each tool checks the ones it needs and returns a
// user-safe error when one is missing, so the Settings widget works on day one.
const envSchema = z.object({
  // Optional: a fal key with the Billing preset, only for reading what fal
  // actually charged (video_spend). FAL_KEY stays without billing access.
  FAL_BILLING_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  // Optional: Nebius Token Factory, for judge_design (Genkit, Nemotron);
  // without it the tool says the check isn't set up.
  NEBIUS_API_KEY: z.string().optional(),
  // Optional until the tools that call them land: Qloo's Taste API and
  // Tavily search.
  QLOO_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  // The wovain logo agents show for the connector (public/icon.png).
  WOVAIN_ICON_URL: z.url().optional(),
  // The built widgets beside this package: src/ in development and tests,
  // dist/ once built (`pnpm build`, which App Hosting runs before start).
  WOVAIN_WIDGETS_DIR: z
    .string()
    .default(() =>
      path.join(import.meta.dirname, "..", "..", "widgets", "dist")
    ),
});

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
