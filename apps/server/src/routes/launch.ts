import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import { z } from "zod";

import type { BrowserSignIn } from "../lib/browser-sign-in.ts";
import { newNonce, nonceHashOf } from "../lib/connections.ts";
import type { LaunchApprovals } from "../lib/launch-approvals.ts";
import { logErrorClass } from "../lib/tool-result.ts";
import { page } from "./page.ts";

// The browser nonce that binds a sign-in flow to the tab that opened the
// link. Lax so it rides along on the top-level redirects back from AuthKit
// and the provider; scoped to the callbacks.
export const NONCE_COOKIE = "wovain_connect";
export const nonceCookie = (site: string) => ({
  httpOnly: true,
  maxAge: 600,
  path: "/oauth/callback",
  sameSite: "Lax" as const,
  secure: site.startsWith("https:"),
});

// The confirm page's own cookie: Strict, so no other site can send it with a
// POST, and scoped to the confirm path.
const CONFIRM_COOKIE = "wovain_launch";
const confirmCookie = (site: string) => ({
  httpOnly: true,
  maxAge: 600,
  path: "/confirm/launch",
  sameSite: "Strict" as const,
  secure: site.startsWith("https:"),
});

const ASK_AGAIN = "Press Launch on the campaign widget again.";

// After the merchant signed in as the request's owner: the campaign, its
// budget and a Confirm button. The page's cookie and CSRF token are stored
// as hashes; only a POST that brings both approves the launch.
export const showLaunchConfirm = async (
  c: Context,
  launches: LaunchApprovals,
  { id, site, userId }: { id: string; site: string; userId: string }
) => {
  const confirm = newNonce();
  const csrf = newNonce();
  const shown = await launches.prepare(id, userId, {
    confirmHash: nonceHashOf(confirm),
    csrfHash: nonceHashOf(csrf),
  });
  deleteCookie(c, NONCE_COOKIE, { path: "/oauth/callback" });
  if (shown === undefined) {
    return await page(c, 400, "Link expired", ASK_AGAIN);
  }
  setCookie(c, CONFIRM_COOKIE, confirm, confirmCookie(site));
  return await page(
    c,
    200,
    "Launch your campaign?",
    html`<p>${shown.summary}</p>
      <p>
        Meta starts spending your budget once it's live. You can pause it in Ads
        Manager at any time.
      </p>
      <form method="post" action="/confirm/launch/${id}">
        <input type="hidden" name="csrf" value="${csrf}" />
        <button type="submit">Confirm and launch</button>
      </form>`
  );
};

interface Deps {
  launches: LaunchApprovals;
  signIn: BrowserSignIn;
  site: string;
}

// The launch confirm page: the widget's Launch button opens it, the merchant
// signs in to wovain in this browser, then confirms. Only the POST approves.
export const createLaunchRoutes = ({ launches, signIn, site }: Deps) => {
  const app = new Hono();

  app.get("/confirm/launch/:id", async (c) => {
    const nonce = newNonce();
    try {
      const url = await signIn.startLaunch(
        c.req.param("id"),
        nonceHashOf(nonce)
      );
      if (url === undefined) {
        return await page(c, 400, "Link expired", ASK_AGAIN);
      }
      setCookie(c, NONCE_COOKIE, nonce, nonceCookie(site));
      return c.redirect(url.href, 302);
    } catch (error) {
      logErrorClass("launch confirm start failed:", error);
      return await page(c, 502, "Couldn't start sign-in", ASK_AGAIN);
    }
  });

  app.post("/confirm/launch/:id", async (c) => {
    const refused = async () =>
      await page(
        c,
        403,
        "Not launched",
        `This launch wasn't confirmed. ${ASK_AGAIN}`
      );
    const origin = c.req.header("origin");
    const cookie = getCookie(c, CONFIRM_COOKIE);
    const form = await c.req.parseBody().catch(() => ({}));
    const csrf = z.object({ csrf: z.string() }).safeParse(form).data?.csrf;
    if (
      (origin !== undefined && origin !== new URL(site).origin) ||
      cookie === undefined ||
      typeof csrf !== "string"
    ) {
      return await refused();
    }
    const approved = await launches.confirm(
      c.req.param("id"),
      nonceHashOf(cookie),
      nonceHashOf(csrf)
    );
    if (!approved) {
      return await refused();
    }
    deleteCookie(c, CONFIRM_COOKIE, { path: "/confirm/launch" });
    return await page(
      c,
      200,
      "Launch confirmed",
      'Go back to your chat and say "I confirmed the launch". wovain publishes the campaign then.'
    );
  });

  return app;
};
