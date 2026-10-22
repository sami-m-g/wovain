import { Hono } from "hono";
import type { Context } from "hono";
import { html } from "hono/html";

import { providers, providerSchema } from "../lib/connections.ts";
import { clientMetadata, clientMetadataUrl } from "../lib/oauth-client.ts";
import { logErrorClass } from "../lib/tool-result.ts";
import type { Upstream } from "../lib/upstream.ts";

// A small page for the browser tab the merchant opened from the chat.
const page = async (
  c: Context,
  status: 200 | 400 | 502,
  title: string,
  body: string
) => {
  c.header("cache-control", "no-store");
  c.header("referrer-policy", "no-referrer");
  return await c.html(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title} · wovain</title>
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
            <h1>${title}</h1>
            <p>${body}</p>
          </main>
        </body>
      </html>`,
    status
  );
};

// The OAuth client side of wovain's connections: its Client ID Metadata
// Document, the link the chat hands out and the providers' redirect back.
export const createConnectRoutes = (site: string, upstream: Upstream) => {
  const app = new Hono();

  app.get("/oauth/client.json", (c) => {
    c.header("cache-control", "public, max-age=3600");
    return c.json({
      ...clientMetadata(site),
      client_id: clientMetadataUrl(site),
    });
  });

  app.get("/connect/:provider", async (c) => {
    const provider = providerSchema.safeParse(c.req.param("provider"));
    const ticket = c.req.query("ticket");
    if (!provider.success || ticket === undefined) {
      return await page(
        c,
        400,
        "Link not valid",
        "Ask wovain in your chat for a new link."
      );
    }
    const { title } = providers[provider.data];
    try {
      const url = await upstream.startConnect(ticket, provider.data);
      return url === undefined
        ? await page(
            c,
            400,
            "Link expired",
            `This ${title} link was already used or is more than 10 minutes old. Ask wovain in your chat for a new one.`
          )
        : c.redirect(url.href, 302);
    } catch (error) {
      logErrorClass("connect start failed:", error);
      return await page(
        c,
        502,
        `Couldn't reach ${title}`,
        "Try again in a minute, from a new link."
      );
    }
  });

  app.get("/oauth/callback/:provider", async (c) => {
    const provider = providerSchema.safeParse(c.req.param("provider"));
    if (!provider.success) {
      return await page(
        c,
        400,
        "Not connected",
        "Ask wovain in your chat for a new link."
      );
    }
    const { title } = providers[provider.data];
    const failed = async () =>
      await page(
        c,
        400,
        `${title} not connected`,
        `wovain didn't get access to your ${title} account. Ask wovain in your chat for a new link to try again.`
      );
    const { code, iss, state } = c.req.query();
    if (code === undefined || state === undefined) {
      return await failed();
    }
    try {
      const connected = await upstream.finishConnect(provider.data, {
        code,
        state,
        ...(iss === undefined ? {} : { iss }),
      });
      return connected
        ? await page(
            c,
            200,
            `${title} connected`,
            "You can close this tab and go back to your chat."
          )
        : await failed();
    } catch (error) {
      logErrorClass("connect callback failed:", error);
      return await failed();
    }
  });

  return app;
};
