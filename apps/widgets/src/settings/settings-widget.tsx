import { settingsResultSchema } from "@wovain/shared/settings";
import type { Settings } from "@wovain/shared/settings";

import {
  callTool,
  readWidgetState,
  useWidget,
  writeWidgetState,
} from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { SettingsWidgetView } from "./settings-widget-view.tsx";
import { widgetSchema } from "./state.ts";

// Wires the view to ChatGPT: the tool result opens it, Save calls update_settings.
export const SettingsWidget = () => {
  const widget = useWidget("settings", settingsResultSchema);
  return (
    <WidgetShell
      loading="Loading your settings…"
      name="settings"
      widget={widget}
    >
      {({ app, data }) => (
        <SettingsWidgetView
          initialState={readWidgetState(widgetSchema)}
          onRemember={writeWidgetState}
          onSave={async (settings: Settings) => {
            const saved = await callTool(
              app,
              settingsResultSchema,
              "update_settings",
              { patch: settings }
            );
            return saved.settings;
          }}
          settings={data.settings}
          videoPrices={data.videoPrices}
        />
      )}
    </WidgetShell>
  );
};
