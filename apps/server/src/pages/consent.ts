import { html } from "hono/html";

import { alert, page } from "./page.ts";
import type { Html } from "./page.ts";

// ChatGPT's OAuth redirect. Any app can register itself and pick its own name,
// so only a client returning to exactly this address is shown by name.
const CHATGPT_REDIRECT = {
  hosts: new Set(["chatgpt.com", "chat.openai.com"]),
  path: "/connector_platform_oauth_redirect",
};

const parse = (uri: string | null) =>
  uri !== null && URL.canParse(uri) ? new URL(uri) : undefined;

const returnsToChatGpt = (url: URL | undefined) =>
  url !== undefined &&
  url.protocol === "https:" &&
  url.port === "" &&
  url.username === "" &&
  url.password === "" &&
  CHATGPT_REDIRECT.hosts.has(url.hostname) &&
  url.pathname === CHATGPT_REDIRECT.path;

export const expiredPage = (): Html =>
  page(
    "Allow access · wovain",
    html`<main class="panel">
      <h1>This link has expired</h1>
      <p>Go back to your agent and connect wovain again.</p>
    </main>`
  );

// Allow posts back here with the signed OAuth query; the server then returns
// the merchant to the agent with a code, or with an error after Deny.
export const consentPage = (options: {
  clientName: string | undefined;
  error?: string;
  oauthQuery: string;
  redirectUri: string | null;
}): Html => {
  const redirect = parse(options.redirectUri);
  const host = redirect?.host ?? "an unknown address";
  const trusted = returnsToChatGpt(redirect);
  const name = trusted
    ? (options.clientName ?? "ChatGPT")
    : "An unverified app";
  return page(
    "Allow access · wovain",
    html`<main class="panel">
      <h1>Allow ${name} to use wovain?</h1>
      <p>
        It will design products, make ads and run campaigns for your shop
        through wovain, as you ask in chat. You’ll go back to
        <strong>${host}</strong>.
      </p>
      ${
        trusted
          ? ""
          : html`<p role="alert">
              This app doesn’t return to ChatGPT. Deny unless you set it up
              yourself.
            </p>`
      }
      <form method="post">
        <input type="hidden" name="oauth_query" value="${options.oauthQuery}" />
        <div class="actions">
          <button class="primary" name="accept" value="true" type="submit">
            Allow
          </button>
          <button name="accept" value="false" type="submit">Deny</button>
        </div>
      </form>
      ${alert(options.error)}
    </main>`
  );
};
