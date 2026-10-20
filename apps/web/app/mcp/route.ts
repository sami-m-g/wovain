import path from "node:path";

import { createHttpFetch, createStore, loadEnv } from "@wovain-foss/server";

// Paths are resolved from apps/web, where Next runs locally and on Vercel; the
// files are traced into the function by next.config.ts.
// oxlint-disable-next-line eslint/no-inline-comments -- Turbopack reads this hint inline
const apps = path.join(/* turbopackIgnore: true */ process.cwd(), "..");

// Vercel's disk is read-only apart from /tmp: data lives there until the
// store moves to Neon.
const dataDir =
  process.env["VERCEL"] === "1"
    ? "/tmp/wovain"
    : path.join(apps, "server", "data");

const env = loadEnv({
  WOVAIN_CARDS_DIR: path.join(apps, "cards", "dist"),
  WOVAIN_DATA_DIR: dataDir,
  WOVAIN_FONT: path.join(
    apps,
    "server",
    "assets",
    "fonts",
    "DejaVuSans-Bold.ttf"
  ),
  ...process.env,
});

const handle = createHttpFetch(env, createStore(env.WOVAIN_DATA_DIR));

export const DELETE = handle;
export const GET = handle;
export const POST = handle;
