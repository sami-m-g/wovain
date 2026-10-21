import { html } from "hono/html";

import { alert, page } from "./page.ts";
import type { Html } from "./page.ts";

// The agent opens this page when it connects to wovain the first time. The
// form posts back here with the signed OAuth query, so after Google the
// server continues the agent's authorization.
export const signInPage = (options: {
  error?: string;
  googleReady: boolean;
  oauthQuery: string | undefined;
}): Html =>
  page(
    "Sign in · wovain",
    html`<main class="panel">
      <h1>Sign in to wovain</h1>
      <p>
        Your designs, ads and settings stay with your account, so any chat picks
        up where you left off.
      </p>
      ${
        options.googleReady
          ? html`<form method="post">
              <input
                type="hidden"
                name="oauth_query"
                value="${options.oauthQuery ?? ""}"
              />
              <button class="primary" type="submit">
                Continue with Google
              </button>
            </form>`
          : html`<p role="alert">Sign-in isn’t set up on this server yet.</p>`
      }
      ${alert(options.error)}
    </main>`
  );
