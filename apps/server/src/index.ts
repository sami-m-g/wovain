import path from "node:path";

import { createApp } from "./app.ts";
import { createRuntime } from "./runtime.ts";
import { registerTelemetry } from "./telemetry.ts";

// The deployed server: Vercel serves this Hono app's default export, and
// `bun run dev` serves it on localhost:3000.
registerTelemetry();

const app = createApp(createRuntime());

// public/ (the logo) for `bun run dev`; on Vercel the CDN serves it first.
const publicDir = path.join(import.meta.dirname, "..", "public");
for (const file of ["icon.png", "favicon.ico"]) {
  app.get(`/${file}`, () => new Response(Bun.file(path.join(publicDir, file))));
}

export default app;
