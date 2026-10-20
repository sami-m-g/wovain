import path from "node:path";

import type { Media } from "@wovain-foss/server";
import {
  blobMedia,
  fileMedia,
  loadEnv,
  openDatabase,
} from "@wovain-foss/server";
import type { SQL } from "bun";

import { createAuth } from "./auth.ts";
import { loadAuthEnv } from "./env.ts";

// Paths are resolved from apps/web, where Next runs locally and on Vercel; the
// files are traced into the function by next.config.ts.
// oxlint-disable-next-line eslint/no-inline-comments -- Turbopack reads this hint inline
const apps = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

export const env = loadEnv({
  WOVAIN_CARDS_DIR: path.join(apps, "cards", "dist"),
  WOVAIN_DATA_DIR: path.join(apps, "server", "data"),
  WOVAIN_FONT: path.join(
    apps,
    "server",
    "assets",
    "fonts",
    "DejaVuSans-Bold.ttf"
  ),
  ...process.env,
});

// Neon and the private Blob store when hosted; SQLite and files without them.
export const storage: { db: SQL; media: Media } = {
  db: openDatabase(env.DATABASE_URL, env.WOVAIN_DATA_DIR),
  media:
    env.BLOB_READ_WRITE_TOKEN === undefined
      ? fileMedia(path.join(env.WOVAIN_DATA_DIR, "media"))
      : blobMedia(env.BLOB_READ_WRITE_TOKEN),
};

export const auth = createAuth(loadAuthEnv(), env.WOVAIN_DATA_DIR);
