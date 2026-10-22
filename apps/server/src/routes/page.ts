import type { Context } from "hono";
import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Body = HtmlEscapedString | Promise<HtmlEscapedString> | string;

// A small, plain page: the connect flow's browser tab, and the policy pages
// Meta's App Review links to.
export const page = async (
  c: Context,
  status: 200 | 400 | 403 | 502,
  title: string,
  body: Body
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
              width: min(100%, 36rem);
              padding: 32px;
              border: 1px solid #8884;
              border-radius: 16px;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 1.375rem;
            }
            h2 {
              margin: 24px 0 4px;
              font-size: 1rem;
            }
            p,
            li {
              margin: 0 0 8px;
              opacity: 0.8;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>${title}</h1>
            ${typeof body === "string" ? html`<p>${body}</p>` : body}
          </main>
        </body>
      </html>`,
    status
  );
};
