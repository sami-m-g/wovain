import { settingsResultSchema } from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";

import {
  callTool,
  readWidgetState,
  useWidget,
  writeWidgetState,
} from "../lib/bridge.ts";
import { SettingsWidgetView } from "./settings-widget-view.tsx";
import { widgetSchema } from "./state.ts";

// Wires the view to ChatGPT: the tool result opens it, Save calls update_settings.
export const SettingsWidget = () => {
  const { app, data, error } = useWidget("settings", settingsResultSchema);

  if (error !== null) {
    return (
      <p className="text-danger p-4 text-sm">
        The settings widget couldn’t connect. Ask again to reload it.
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
    <SettingsWidgetView
      initialState={readWidgetState(widgetSchema)}
      onRemember={writeWidgetState}
      onSave={save}
      settings={data.settings}
      videoPrices={data.videoPrices}
    />
  );
};
