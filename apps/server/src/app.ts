import { Hono } from "hono";
import { html } from "hono/html";

import { siteUrl } from "./auth/env.ts";
import { page } from "./pages/page.ts";
import { createMcpRoute } from "./routes/mcp.ts";
import type { Runtime } from "./runtime.ts";

// Every route wovain serves: /mcp for agents, the metadata naming AuthKit as
// its sign-in, and the home page. AuthKit hosts sign-in and consent.
export const createApp = (runtime: Runtime) => {
  const { auth, authEnv } = runtime;
  const site = siteUrl(authEnv);
  const mcp = createMcpRoute(runtime);

  const app = new Hono();

  app.all("/mcp", async (c) => await mcp(c.req.raw));

  // Agents look for /mcp's metadata at
  // /.well-known/oauth-protected-resource/mcp (some try the bare path).
  for (const path of [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
  ]) {
    app.get(path, (c) => {
      c.header("access-control-allow-origin", "*");
      return c.json(auth.metadata);
    });
  }

  app.get(
    "/",
    async (c) =>
      await c.html(
        page(
          "wovain",
          html`<main class="panel">
            <h1>wovain</h1>
            <p>
              An MCP server for print-on-demand sellers. Connect your agent to
              <code>${site}/mcp</code>.
            </p>
          </main>`
        )
      )
  );

  return app;
};
