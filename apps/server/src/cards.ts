import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

// Each card is one self-contained HTML file built by apps/cards (Vite single-file).
const cardNames = ["settings"] as const;
export type CardName = (typeof cardNames)[number];

// The URI is the host's cache key: bump the version when a card changes shape.
export const cardUri = (name: CardName) => `ui://wovain/${name}-v1.html`;

export const registerCards = (server: McpServer, cardsDir: string) => {
  for (const name of cardNames) {
    const uri = cardUri(name);
    registerAppResource(server, `wovain ${name} card`, uri, {}, async () => ({
      contents: [
        {
          _meta: { ui: { prefersBorder: true } },
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(path.join(cardsDir, `${name}.html`), "utf-8"),
          uri,
        },
      ],
    }));
  }
};
