import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

// Each widget is one self-contained HTML file built by apps/widgets (Vite single-file).
const widgetNames = ["settings", "design", "ad", "campaign"] as const;
export type WidgetName = (typeof widgetNames)[number];

// The URI is the host's cache key: bump the version when a widget changes shape.
export const widgetUri = (name: WidgetName) => `ui://wovain/${name}-v3.html`;

// Widgets run in a sandbox that only loads media from declared hosts:
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

export const registerWidgets = (server: McpServer, widgetsDir: string) => {
  for (const name of widgetNames) {
    const uri = widgetUri(name);
    registerAppResource(
      server,
      `wovain ${name} widget`,
      uri,
      { _meta: { ui } },
      async () => ({
        contents: [
          {
            _meta: { ui },
            mimeType: RESOURCE_MIME_TYPE,
            text: await readFile(
              path.join(widgetsDir, `${name}.html`),
              "utf-8"
            ),
            uri,
          },
        ],
      })
    );
  }
};
