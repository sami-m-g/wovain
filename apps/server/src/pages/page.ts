import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

import { styles } from "./styles.ts";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// The shell around wovain's home page; AuthKit hosts sign-in and consent.
export const page = (title: string, body: Html): Html =>
  html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <meta
          name="description"
          content="From a product idea to live Fourthwall products and a Meta Advantage+ campaign, one approved widget at a time."
        />
        <link rel="icon" href="/favicon.ico" />
        <style>
          ${raw(styles)}
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;
