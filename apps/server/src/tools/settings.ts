import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  settingsPatchSchema,
  settingsResultSchema,
} from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";
import { z } from "zod";

import type { VideoPricing } from "../lib/fal-pricing.ts";
import { text } from "../lib/tool-result.ts";
import type { Store } from "../store.ts";
import { widgetUri } from "../widgets.ts";

export const registerSettingsTools = (
  server: McpServer,
  store: Store,
  videoPricing: VideoPricing
) => {
  // Every settings result carries current video prices for the widget's labels.
  const result = async (settings: Settings, message: string) => ({
    content: text(message),
    structuredContent: { settings, videoPrices: await videoPricing() },
  });

  server.registerTool(
    "get_settings",
    {
      annotations: { readOnlyHint: true },
      description:
        "Read every wovain setting (pricing, economics, campaign budget, rules, video, audio, Meta). Call before any step that uses a setting.",
      outputSchema: settingsResultSchema,
      title: "Get wovain settings",
    },
    async () => {
      const settings = await store.getSettings();
      return await result(settings, JSON.stringify(settings));
    }
  );

  // Widgets call this directly (Save, ⚙ quick settings), so it is visible to both.
  registerAppTool(
    server,
    "update_settings",
    {
      _meta: {
        ui: {
          resourceUri: widgetUri("settings"),
          visibility: ["model", "app"],
        },
      },
      annotations: { idempotentHint: true },
      description:
        "Change one or more wovain settings. Pass only the groups and fields that change; everything else keeps its value. New widgets use the result right away.",
      inputSchema: z.object({ patch: settingsPatchSchema }),
      outputSchema: settingsResultSchema,
      title: "Update wovain settings",
    },
    async ({ patch }) => {
      const settings = await store.updateSettings(patch);
      return await result(settings, `Saved. ${JSON.stringify(settings)}`);
    }
  );

  registerAppTool(
    server,
    "show_settings_widget",
    {
      _meta: { ui: { resourceUri: widgetUri("settings") } },
      annotations: { readOnlyHint: true },
      description:
        "Show the wovain Settings widget, where the merchant can view and edit every setting. Use when the merchant asks for wovain settings.",
      outputSchema: settingsResultSchema,
      title: "Show wovain settings",
    },
    async () => {
      const settings = await store.getSettings();
      return await result(settings, "Showing the wovain Settings widget.");
    }
  );
};
