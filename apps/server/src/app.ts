import { Hono } from "hono";
import { html } from "hono/html";

import { requestErrors } from "./lib/request-errors.ts";
import { createConfirmRoutes } from "./routes/confirm.ts";
import { createConnectRoutes } from "./routes/connect.ts";
import { createMcpRoute } from "./routes/mcp.ts";
import { createPolicyPages } from "./routes/pages.ts";
import { createTaskRoutes } from "./routes/tasks.ts";
import { createWebhookRoutes } from "./routes/webhooks.ts";
import type { Runtime } from "./runtime.ts";
import { createStore } from "./store.ts";

// Every route wovain serves: /mcp for agents, the metadata naming AuthKit as
// its sign-in, and the home page. AuthKit hosts sign-in and consent.
export const createApp = (runtime: Runtime) => {
  const { auth, confirm, connect, env, optimizer, storage } = runtime;
  const site = env.WOVAIN_SITE_URL;
  const mcp = createMcpRoute(runtime);

  const app = new Hono();

  // First, so every route's failures are logged by route template.
  app.use(requestErrors);

  app.all("/mcp", async (c) => await mcp(c.req.raw));

  app.route("/", createPolicyPages());

  // Signed events from merchants' shops and ad accounts, and the Cloud
  // Tasks they queue (docs/changes/25-optimizer).
  if (optimizer !== undefined) {
    app.route("/", createWebhookRoutes(optimizer));
    app.route("/", createTaskRoutes({ ...optimizer, site }));
  }

  // Merchants connect their Fourthwall, fal and Meta accounts here.
  if (connect !== undefined) {
    app.route("/", createConnectRoutes({ ...connect, site }));
  }

  // Merchants confirm a design's approval in the browser here.
  if (confirm !== undefined) {
    app.route(
      "/",
      createConfirmRoutes({
        confirm,
        site,
        storeFor: (userId) => createStore(storage.db, storage.media, userId),
      })
    );
  }

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
        html`<!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta
                name="viewport"
                content="width=device-width, initial-scale=1"
              />
              <title>wovain</title>
              <meta
                name="description"
                content="From a product idea to live Fourthwall products and a Meta Advantage+ campaign, one approved widget at a time."
              />
              <link rel="icon" href="/favicon.ico" />
              <style>
                :root {
                  color-scheme: light dark;
                }
                body {
                  margin: 0;
                  min-height: 100dvh;
                  display: grid;
                  place-items: center;
                  padding: 16px;
                  font:
                    16px/1.5 system-ui,
                    sans-serif;
                }
                main {
                  width: min(100%, 26rem);
                  padding: 32px;
                  border: 1px solid #8884;
                  border-radius: 16px;
                }
                h1 {
                  margin: 0 0 8px;
                  font-size: 1.375rem;
                }
                p {
                  margin: 0;
                  opacity: 0.7;
                }
              </style>
            </head>
            <body>
              <main>
                <h1>wovain</h1>
                <p>
                  An MCP server for print-on-demand sellers. Connect your agent
                  to <code>${site}/mcp</code>.
                </p>
              </main>
            </body>
          </html>`
      )
  );

  return app;
};
