import { existsSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

// Keys are optional at startup: each tool checks the ones it needs and returns a
// user-safe error when one is missing, so the Settings card works on day one.
const envSchema = z.object({
  ETSY_API_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  MARKER_API_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  // ChatGPT passes PLUGIN_ROOT/PLUGIN_DATA through mcp.json; in dev these
  // default to the repo so `bun run start` works without a plugin install.
  WOVAIN_CARDS_DIR: z
    .string()
    .default(path.join(import.meta.dir, "..", "..", "cards", "dist")),
  WOVAIN_DATA_DIR: z.string().default(path.join(import.meta.dir, "..", "data")),
  WOVAIN_HTTP_PORT: z.coerce.number().int().optional(),
  WOVAIN_MOCK: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;

// The desktop app doesn't pass your shell environment to plugin servers, so the
// installed plugin points WOVAIN_ENV_FILE at the repo's .env instead.
export const loadEnv = (
  source: Record<string, string | undefined> = process.env
): Env => {
  // A missing file only means no keys yet: the Settings card still works, and
  // tools that need a key say so. Crashing here would hide every tool.
  const envFile = source["WOVAIN_ENV_FILE"];
  if (envFile !== undefined && envFile !== "") {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
    } else {
      console.error(`wovain: no env file at ${envFile}; starting without keys`);
    }
  }
  // `cp .env.example .env` leaves `KEY=` lines; treat those as unset.
  return envSchema.parse(
    Object.fromEntries(
      Object.entries(source).filter(([, value]) => value !== "")
    )
  );
};
