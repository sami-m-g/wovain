import path from "node:path";

import { createDb } from "@wovain/db";
import { blobMedia, loadEnv } from "@wovain/server";

import { createAuth } from "./auth.ts";
import { loadAuthEnv, siteUrl } from "./env.ts";

// Paths are resolved from apps/web, where Next runs locally and on Vercel; the
// files are traced into the function by next.config.ts.
// oxlint-disable-next-line eslint/no-inline-comments -- Turbopack reads this hint inline
const apps = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

export const authEnv = loadAuthEnv();

export const env = loadEnv({
  WOVAIN_ICON_URL: `${siteUrl(authEnv)}/icon.png`,
  WOVAIN_WIDGETS_DIR: path.join(apps, "widgets", "dist"),
  ...process.env,
});

// Neon (main in production, the dev branch locally) and the private Blob
// store. Nothing connects until the first query, so `next build` works
// without DATABASE_URL; requests then fail until it is set.
const db = createDb(env.DATABASE_URL ?? "postgres://unset.invalid/wovain");

export const storage = { db, media: blobMedia(env.BLOB_READ_WRITE_TOKEN) };

export const auth = createAuth(authEnv, db);
