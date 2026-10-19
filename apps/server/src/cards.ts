import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

// Each card is one self-contained HTML file built by apps/cards (Vite single-file).
const cardNames = ["settings", "design", "ad", "campaign"] as const;
export type CardName = (typeof cardNames)[number];

// The URI is the host's cache key: bump the version when a card changes shape.
export const cardUri = (name: CardName) => `ui://wovain/${name}-v3.html`;

// Cards run in a sandbox that only loads media from declared hosts:
// Fourthwall's mockups and artwork, and fal's generated videos.
const ui = {
  csp: {
    resourceDomains: [
      "https://cdn.fourthwall.com",
      "https://imgproxy.fourthwall.dev",
      // fal serves media from several hosts (v3b.fal.media for finished clips).
      "https://fal.media",
      "https://*.fal.media",
      "https://v3.fal.media",
      "https://v3b.fal.media",
    ],
  },
  prefersBorder: true,
};

export const registerCards = (server: McpServer, cardsDir: string) => {
  for (const name of cardNames) {
    const uri = cardUri(name);
    registerAppResource(
      server,
      `wovain ${name} card`,
      uri,
      { _meta: { ui } },
      async () => ({
        contents: [
          {
            _meta: { ui },
            mimeType: RESOURCE_MIME_TYPE,
            text: await readFile(path.join(cardsDir, `${name}.html`), "utf-8"),
            uri,
          },
        ],
      })
    );
  }
};
