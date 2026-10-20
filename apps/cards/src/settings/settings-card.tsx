import { settingsResultSchema } from "@wovain-foss/shared/settings";
import type { Settings } from "@wovain-foss/shared/settings";

import {
  callTool,
  readWidgetState,
  useCard,
  writeWidgetState,
} from "../lib/bridge.ts";
import { SettingsCardView } from "./settings-card-view.tsx";
import { widgetSchema } from "./state.ts";

// Wires the view to ChatGPT: the tool result opens it, Save calls update_settings.
export const SettingsCard = () => {
  const { app, data, error } = useCard("settings", settingsResultSchema);

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
    const result = await callTool(
      app,
      settingsResultSchema,
      "update_settings",
      {
        patch: settings,
      }
    );
    return result.settings;
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
