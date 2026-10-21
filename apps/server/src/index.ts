import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { createApp } from "./app.ts";
import { createRuntime } from "./runtime.ts";
import { registerTelemetry } from "./telemetry.ts";

// The deployed server on Node: App Hosting sets PORT, and `pnpm dev` serves it
// on localhost:3000.
registerTelemetry();

const app = createApp(createRuntime());

// public/ (the logo and favicon).
app.use(
  "/*",
  serveStatic({ root: new URL("../public", import.meta.url).pathname })
);

serve({ fetch: app.fetch, port: Number(process.env["PORT"] ?? 3000) });
