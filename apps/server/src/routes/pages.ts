import { Hono } from "hono";
import { html } from "hono/html";

import { page } from "./page.ts";

const CONTACT =
  "https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43085639/showcase/-/issues";

// The privacy policy and data-deletion instructions Meta's App Review (and
// app directories) link to. Short on purpose: wovain keeps little.
export const createPolicyPages = () => {
  const app = new Hono();

  app.get(
    "/privacy",
    async (c) =>
      await page(
        c,
        200,
        "Privacy policy",
        html`<p>
            wovain helps print-on-demand sellers turn a product idea into a
            Fourthwall product and a Meta ad campaign, through an AI agent.
          </p>
          <h2>What wovain stores</h2>
          <ul>
            <li>Your sign-in identity from WorkOS (an ID and your email).</li>
            <li>
              Your designs, artwork, ad copy, settings and campaign IDs, so each
              step can pick up where the last one stopped.
            </li>
            <li>
              Access to the Fourthwall, fal and Meta accounts you connect,
              encrypted with Google Cloud KMS. wovain uses it only for the steps
              you ask for and approve.
            </li>
          </ul>
          <h2>What wovain does with Meta data</h2>
          <p>
            It reads your ad accounts, Pages, pixels and ad results, builds your
            campaign as a paused draft, publishes it only when you press Launch,
            and creates its automated rules. It doesn't sell, share or use your
            data for anything else, and it doesn't store your ad results.
          </p>
          <h2>Where it lives</h2>
          <p>
            Google Cloud (Firestore and Cloud Storage) in the United States.
            Only wovain's server can read it.
          </p>
          <h2>Deleting it</h2>
          <p>
            See <a href="/data-deletion">how to delete your data</a>. Questions:
            <a href=${CONTACT}>open an issue</a>.
          </p>`
      )
  );

  app.get(
    "/data-deletion",
    async (c) =>
      await page(
        c,
        200,
        "Delete your data",
        html`<p>
            To remove wovain's access to your Meta account (or Fourthwall or
            fal), ask your agent: "Disconnect Meta from wovain." wovain deletes
            the stored access at once. You can also remove wovain in Facebook
            under Settings, Business Integrations.
          </p>
          <p>
            To delete everything else wovain keeps about you (designs, artwork,
            settings and campaign IDs),
            <a href=${CONTACT}>open a confidential issue</a>
            asking for deletion. It's done within 30 days, and we confirm when
            it is.
          </p>`
      )
  );

  return app;
};
