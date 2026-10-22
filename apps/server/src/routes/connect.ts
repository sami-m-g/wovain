import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import type { BrowserSignIn } from "../lib/browser-sign-in.ts";
import {
  newNonce,
  nonceHashOf,
  providers,
  providerSchema,
} from "../lib/connections.ts";
import { countStep } from "../lib/funnel.ts";
import { clientMetadata, clientMetadataUrl } from "../lib/oauth-client.ts";
import { logErrorClass } from "../lib/tool-result.ts";
import type { Upstream } from "../lib/upstream.ts";
import {
  createLaunchRoutes,
  NONCE_COOKIE,
  nonceCookie,
  showLaunchConfirm,
} from "./launch.ts";
import { page } from "./page.ts";

const ASK_AGAIN = "Ask wovain in your chat for a new link.";

interface Deps {
  signIn: BrowserSignIn;
  site: string;
  upstream: Upstream;
}

// The OAuth client side of wovain's connections: its Client ID Metadata
// Document, the link the chat hands out, the merchant's sign-in to wovain in
// the browser, and the providers' redirect back. A link only connects the
// account of the merchant it was made for, in the browser that opened it.
export const createConnectRoutes = ({ signIn, site, upstream }: Deps) => {
  const app = new Hono();
  const { launches } = upstream;

  app.route("/", createLaunchRoutes({ launches, signIn, site }));

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
      return await page(c, 400, "Link not valid", ASK_AGAIN);
    }
    const { title } = providers[provider.data];
    const nonce = newNonce();
    try {
      const url = await signIn.start(ticket, provider.data, nonceHashOf(nonce));
      if (url === undefined) {
        return await page(
          c,
          400,
          "Link expired",
          `This ${title} link was already used or is more than 5 minutes old. ${ASK_AGAIN}`
        );
      }
      setCookie(c, NONCE_COOKIE, nonce, nonceCookie(site));
      return c.redirect(url.href, 302);
    } catch (error) {
      logErrorClass("connect start failed:", error);
      return await page(c, 502, "Couldn't start sign-in", ASK_AGAIN);
    }
  });

  // Back from signing in to wovain: only the merchant the link was made for
  // goes on to the provider.
  app.get("/oauth/callback/wovain", async (c) => {
    const nonce = getCookie(c, NONCE_COOKIE);
    const { code, iss, state } = c.req.query();
    if (nonce === undefined || code === undefined || state === undefined) {
      return await page(
        c,
        400,
        "Not connected",
        `Open the link in the same browser you sign in with. ${ASK_AGAIN}`
      );
    }
    try {
      const signedIn = await signIn.finish({
        code,
        iss,
        nonceHash: nonceHashOf(nonce),
        state,
      });
      if (signedIn === undefined) {
        return await page(c, 400, "Not connected", ASK_AGAIN);
      }
      if (!signedIn.matches) {
        deleteCookie(c, NONCE_COOKIE, { path: "/oauth/callback" });
        return await page(
          c,
          403,
          "Wrong wovain account",
          "This link was made for a different wovain account. Sign in with the account you use in your chat, then ask wovain for a new link."
        );
      }
      if (signedIn.launch !== undefined) {
        return await showLaunchConfirm(c, launches, {
          id: signedIn.launch,
          site,
          userId: signedIn.userId,
        });
      }
      const url = await upstream.authorize(
        signedIn.userId,
        signedIn.provider,
        nonceHashOf(nonce)
      );
      return url === undefined
        ? await page(c, 502, "Couldn't start the connection", ASK_AGAIN)
        : c.redirect(url.href, 302);
    } catch (error) {
      logErrorClass("connect sign-in failed:", error);
      return await page(c, 400, "Not connected", ASK_AGAIN);
    }
  });

  app.get("/oauth/callback/:provider", async (c) => {
    const provider = providerSchema.safeParse(c.req.param("provider"));
    if (!provider.success) {
      return await page(c, 400, "Not connected", ASK_AGAIN);
    }
    const { title } = providers[provider.data];
    const failed = async () =>
      await page(
        c,
        400,
        `${title} not connected`,
        `wovain didn't get access to your ${title} account. ${ASK_AGAIN}`
      );
    const nonce = getCookie(c, NONCE_COOKIE);
    const { code, iss, state } = c.req.query();
    if (nonce === undefined || code === undefined || state === undefined) {
      return await failed();
    }
    try {
      const connected = await upstream.finishConnect(provider.data, {
        code,
        nonceHash: nonceHashOf(nonce),
        state,
        ...(iss === undefined ? {} : { iss }),
      });
      if (!connected) {
        return await failed();
      }
      deleteCookie(c, NONCE_COOKIE, { path: "/oauth/callback" });
      countStep("connect");
      return await page(
        c,
        200,
        `${title} connected`,
        "You can close this tab and go back to your chat."
      );
    } catch (error) {
      logErrorClass("connect callback failed:", error);
      return await failed();
    }
  });

  return app;
};
