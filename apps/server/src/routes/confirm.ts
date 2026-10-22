import { AUTOPILOT_TERMS } from "@wovain/shared/autopilot";
import { dropProducts, dropTotals } from "@wovain/shared/design";
import type { Design } from "@wovain/shared/design";
import { money } from "@wovain/shared/economics";
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

import { approveDesign, designHash, notApprovable } from "../lib/approval.ts";
import { hashOf } from "../lib/browser-confirm.ts";
import type { BrowserConfirm, Subject } from "../lib/browser-confirm.ts";
import { newNonce } from "../lib/connections.ts";
import { logErrorClass } from "../lib/tool-result.ts";
import type { Store } from "../store.ts";

// The browser nonce that binds a confirmation to the tab that opened the
// link. Lax so it rides along on AuthKit's redirect back; scoped to /confirm.
const NONCE_COOKIE = "wovain_confirm";
const ASK_AGAIN = "Press Approve on the widget in your chat for a new link.";

type Body = HtmlEscapedString | Promise<HtmlEscapedString> | string;

const page = async (
  c: Context,
  status: 200 | 400 | 403 | 409 | 502,
  title: string,
  body: Body
) => {
  c.header("cache-control", "no-store");
  c.header("referrer-policy", "no-referrer");
  c.header("x-frame-options", "DENY");
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
              width: min(100%, 34rem);
              padding: 32px;
              border: 1px solid #8884;
              border-radius: 16px;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 1.375rem;
            }
            p {
              margin: 0 0 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 16px 0;
              font-variant-numeric: tabular-nums;
            }
            th,
            td {
              padding: 6px 4px;
              border-bottom: 1px solid #8883;
              text-align: right;
            }
            th:first-child,
            td:first-child {
              text-align: left;
            }
            button {
              font: inherit;
              padding: 10px 18px;
              border: 0;
              border-radius: 999px;
              background: #3b4fd8;
              color: #fff;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>${title}</h1>
            ${body}
          </main>
        </body>
      </html>`,
    status
  );
};

// What the merchant is approving: every product with its price, profit and
// margin, and the drop's total.
const summary = async (design: Design, secret: string) => {
  const totals = dropTotals(design);
  const rows = await Promise.all(
    dropProducts(design).map(
      async (product) =>
        await html`<tr>
          <td>${product.listing.title}</td>
          <td>${money(product.quote.price)}</td>
          <td>${money(product.quote.profit)}</td>
          <td>${Math.round(product.quote.marginPct)}%</td>
        </tr>`
    )
  );
  return await html`<p>
      ${design.dropName ?? design.idea}: ${totals.count} product(s). wovain
      creates them on your Fourthwall shop at these prices and makes them
      public.
    </p>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Price</th>
          <th>Profit</th>
          <th>Margin</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <form method="post" action="/confirm">
      <input type="hidden" name="secret" value="${secret}" />
      <button type="submit">Confirm and publish</button>
    </form>`;
};

// What the merchant agrees to when they turn autopilot on.
const autopilotTerms = async (secret: string) =>
  await html`<p>
      Autopilot runs the whole journey from your chat without asking you:
      research, designs, products, ads and the campaign. NVIDIA Nemotron decides
      where you'd normally approve, inside these limits:
    </p>
    <ul>
      <li>Products are created hidden on your Fourthwall shop.</li>
      <li>The Meta campaign is staged paused. Nothing spends ad budget.</li>
      <li>
        At most ${money(AUTOPILOT_TERMS.maxSpendUsd)} of your fal credit per
        run, and at most ${AUTOPILOT_TERMS.maxRevisions} revisions per design.
      </li>
      <li>Ads made with AI carry Meta's AI label.</li>
    </ul>
    <p>
      You go live yourself: Launch on the campaign widget makes the products
      public and starts the campaign, after you confirm it here. You can stop a
      run or turn autopilot off from your chat at any time.
    </p>
    <form method="post" action="/confirm">
      <input type="hidden" name="secret" value="${secret}" />
      <button type="submit">Turn autopilot on</button>
    </form>`;

// The approval page for a signed-in merchant's subject.
const confirmPage = async (
  c: Context,
  store: Store,
  { secret, subject }: { secret: string; subject: Subject }
) => {
  if (subject.kind === "autopilot") {
    return await page(c, 200, "Turn on autopilot?", autopilotTerms(secret));
  }
  const design = await store.getDesign(subject.id);
  const refused =
    design === undefined ? "The design is gone." : notApprovable(design);
  if (design === undefined || refused !== undefined) {
    return await page(c, 409, "Can't approve", `${refused} ${ASK_AGAIN}`);
  }
  if (designHash(design) !== subject.hash) {
    return await page(
      c,
      409,
      "Design changed",
      `The design changed after you pressed Approve. ${ASK_AGAIN}`
    );
  }
  return await page(c, 200, "Approve this drop?", summary(design, secret));
};

// The Confirm press: approve the design, or turn autopilot on for the terms
// the page showed.
const applyConfirm = async (store: Store, subject: Subject) => {
  if (subject.kind === "autopilot") {
    if (subject.hash !== `v${AUTOPILOT_TERMS.version}`) {
      throw new Error("The autopilot terms changed.");
    }
    await store.saveAutopilotConsent({
      at: new Date().toISOString(),
      version: AUTOPILOT_TERMS.version,
    });
    return "Autopilot is on. You can close this tab and go back to your chat.";
  }
  await approveDesign(store, subject.id, subject.hash);
  return "You can close this tab. wovain publishes the drop in your chat.";
};

interface Deps {
  confirm: BrowserConfirm;
  site: string;
  storeFor: (userId: string) => Store;
}

// The merchant's confirmation of an approval, outside the chat: the link
// from the widget, a wovain sign-in in the browser, the summary, Confirm.
export const createConfirmRoutes = ({ confirm, site, storeFor }: Deps) => {
  const app = new Hono();
  const nonceCookie = {
    httpOnly: true,
    maxAge: 600,
    path: "/confirm",
    sameSite: "Lax" as const,
    secure: site.startsWith("https:"),
  };

  // Back from signing in: the merchant the link was made for sees what
  // they're approving.
  app.get("/confirm/callback", async (c) => {
    const nonce = getCookie(c, NONCE_COOKIE);
    const { code, iss, state } = c.req.query();
    if (nonce === undefined || code === undefined || state === undefined) {
      return await page(c, 400, "Not confirmed", ASK_AGAIN);
    }
    try {
      const signedIn = await confirm.finish({
        code,
        iss,
        nonceHash: hashOf(nonce),
        state,
      });
      if (signedIn === undefined) {
        return await page(c, 400, "Not confirmed", ASK_AGAIN);
      }
      if (!signedIn.matches) {
        return await page(
          c,
          403,
          "Wrong wovain account",
          "This link was made for a different wovain account. Sign in with the account you use in your chat."
        );
      }
      return await confirmPage(c, storeFor(signedIn.userId), signedIn);
    } catch (error) {
      logErrorClass("confirm sign-in failed:", error);
      return await page(c, 400, "Not confirmed", ASK_AGAIN);
    }
  });

  // Confirm: same site, same browser, the form's single-use secret.
  app.post("/confirm", async (c) => {
    const nonce = getCookie(c, NONCE_COOKIE);
    const form = await c.req.parseBody();
    const { secret } = form;
    const sameOrigin = c.req.header("origin") === new URL(site).origin;
    if (!sameOrigin || nonce === undefined || typeof secret !== "string") {
      return await page(c, 403, "Not confirmed", ASK_AGAIN);
    }
    try {
      const session = await confirm.confirm(secret, hashOf(nonce));
      if (session === undefined) {
        return await page(c, 400, "Not confirmed", ASK_AGAIN);
      }
      deleteCookie(c, NONCE_COOKIE, { path: "/confirm" });
      const done = await applyConfirm(
        storeFor(session.userId),
        session.subject
      );
      return await page(c, 200, "Confirmed", done);
    } catch (error) {
      logErrorClass("confirm failed:", error);
      return await page(c, 409, "Not approved", ASK_AGAIN);
    }
  });

  // The link from the widget: sign in to wovain in this browser first.
  app.get("/confirm/:ticket", async (c) => {
    const nonce = newNonce();
    try {
      const url = await confirm.start(c.req.param("ticket"), hashOf(nonce));
      if (url === undefined) {
        return await page(
          c,
          400,
          "Link expired",
          `This link was already used or is more than 5 minutes old. ${ASK_AGAIN}`
        );
      }
      setCookie(c, NONCE_COOKIE, nonce, nonceCookie);
      return c.redirect(url.href, 302);
    } catch (error) {
      logErrorClass("confirm start failed:", error);
      return await page(c, 502, "Couldn't start sign-in", ASK_AGAIN);
    }
  });

  return app;
};
