import { settingsSchema } from "@wovain-foss/shared/settings";
import type { Settings } from "@wovain-foss/shared/settings";
import { videoPricesSchema } from "@wovain-foss/shared/video-models";
import { z } from "zod";

import { readWidgetState, useCard, writeWidgetState } from "../lib/bridge.ts";
import { SettingsCardView } from "./settings-card-view.tsx";
import { widgetSchema } from "./state.ts";

const resultSchema = z.object({
  settings: settingsSchema,
  videoPrices: videoPricesSchema,
});

// Wires the view to ChatGPT: the tool result opens it, Save calls update_settings.
export const SettingsCard = () => {
  const { app, data, error } = useCard("settings", resultSchema);

  if (error !== null) {
    return (
      <p className="text-danger p-4 text-sm">
        The settings card couldn’t connect. Ask again to reload it.
      </p>
    );
  }
  if (app === null || data === undefined) {
    return <p className="text-secondary p-4 text-sm">Loading your settings…</p>;
  }

  const save = async (settings: Settings) => {
    const result = await app.callServerTool({
      arguments: { patch: settings },
      name: "update_settings",
    });
    const confirmed = resultSchema.safeParse(result.structuredContent);
    if (result.isError === true || !confirmed.success) {
      throw new Error("update_settings failed");
    }
    return confirmed.data.settings;
  };

  return (
    <SettingsCardView
      initialState={readWidgetState(widgetSchema)}
      onRemember={writeWidgetState}
      onSave={save}
      settings={data.settings}
      videoPrices={data.videoPrices}
    />
  );
};
