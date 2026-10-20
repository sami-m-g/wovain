import path from "node:path";

import { z } from "zod";

// Keys are optional at startup: each tool checks the ones it needs and returns a
// user-safe error when one is missing, so the Settings card works on day one.
const envSchema = z.object({
  // A private Vercel Blob store for staged artwork; unset keeps files in
  // WOVAIN_DATA_DIR/media.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  // Neon Postgres (pooled); unset means a SQLite file in WOVAIN_DATA_DIR.
  DATABASE_URL: z.string().optional(),
  ETSY_API_KEY: z.string().optional(),
  // Optional: a fal key with the Billing preset, only for reading what fal
  // actually charged (video_spend). FAL_KEY stays without billing access.
  FAL_BILLING_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  MARKER_API_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  // Paths default to this repo for tests; apps/web passes its own, since a
  // bundled route can't rely on import.meta.dirname.
  WOVAIN_CARDS_DIR: z
    .string()
    .default(() => path.join(import.meta.dirname, "..", "..", "cards", "dist")),
  WOVAIN_DATA_DIR: z
    .string()
    .default(() => path.join(import.meta.dirname, "..", "data")),
  // A bold font for captions, shipped with the server so every host has it.
  WOVAIN_FONT: z
    .string()
    .default(() =>
      path.join(
        import.meta.dirname,
        "..",
        "assets",
        "fonts",
        "DejaVuSans-Bold.ttf"
      )
    ),
  WOVAIN_MOCK: z.stringbool().default(false),
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
