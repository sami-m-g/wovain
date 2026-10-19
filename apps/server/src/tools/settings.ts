import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { settingsPatchSchema, settingsSchema } from "@wovain/shared";
import { z } from "zod";

import { cardUri } from "../cards.ts";
import type { Store } from "../store.ts";

const settingsOutput = z.object({ settings: settingsSchema });

const result = (settings: z.infer<typeof settingsSchema>, text: string) => ({
  content: [{ text, type: "text" as const }],
  structuredContent: { settings },
});

export const registerSettingsTools = (server: McpServer, store: Store) => {
  server.registerTool(
    "get_settings",
    {
      annotations: { readOnlyHint: true },
      description:
        "Read every wovain setting (trends, pricing, economics, campaign budget, rules, video, audio, overlay, Meta). Call before any step that uses a setting.",
      outputSchema: settingsOutput,
      title: "Get wovain settings",
    },
    async () => {
      const settings = await store.getSettings();
      return result(settings, JSON.stringify(settings));
    }
  );

  // Cards call this directly (Save, ⚙ quick settings), so it is visible to both.
  registerAppTool(
    server,
    "update_settings",
    {
      _meta: {
        ui: { resourceUri: cardUri("settings"), visibility: ["model", "app"] },
      },
      annotations: { idempotentHint: true },
      description:
        "Change one or more wovain settings. Pass only the groups and fields that change; everything else keeps its value. New cards use the result right away.",
      inputSchema: z.object({ patch: settingsPatchSchema }),
      outputSchema: settingsOutput,
      title: "Update wovain settings",
    },
    async ({ patch }) => {
      const settings = await store.updateSettings(patch);
      return result(settings, `Saved. ${JSON.stringify(settings)}`);
    }
  );

  registerAppTool(
    server,
    "show_settings_card",
    {
      _meta: { ui: { resourceUri: cardUri("settings") } },
      annotations: { readOnlyHint: true },
      description:
        "Show the wovain Settings card, where the merchant can view and edit every setting. Use when the merchant asks for wovain settings.",
      outputSchema: settingsOutput,
      title: "Show wovain settings",
    },
    async () => {
      const settings = await store.getSettings();
      return result(settings, "Showing the wovain Settings card.");
    }
  );
};
