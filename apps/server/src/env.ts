import path from "node:path";

import { z } from "zod";

// Keys are optional at startup: each tool checks the ones it needs and returns a
// user-safe error when one is missing, so the Settings widget works on day one.
const envSchema = z.object({
  // The private Vercel Blob store for staged artwork.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  // Neon Postgres (pooled): main in production, the dev branch locally.
  DATABASE_URL: z.string().optional(),
  // Optional: a fal key with the Billing preset, only for reading what fal
  // actually charged (video_spend). FAL_KEY stays without billing access.
  FAL_BILLING_KEY: z.string().optional(),
  FAL_KEY: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_SYSTEM_USER_TOKEN: z.string().optional(),
  // The wovain logo agents show for the connector (public/icon.png).
  WOVAIN_ICON_URL: z.url().optional(),
  WOVAIN_MOCK: z.stringbool().default(false),
  // The built widgets beside this package: src/ in development and tests,
  // dist/ once bundled (vercel.json ships apps/widgets/dist with the function).
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
