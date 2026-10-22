import type { App } from "@modelcontextprotocol/ext-apps/react";
import { dashboardResultSchema } from "@wovain/shared/dashboard";
import type { ConnectPrompt } from "@wovain/shared/dashboard";
import { z } from "zod";

import { callTool, say, useWidget } from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { DashboardWidgetView } from "./dashboard-widget-view.tsx";
import { titles } from "./format.ts";

const connectSchema = z.object({ connectUrl: z.url() });

// Connect opens the merchant's personal, single-use link in their browser;
// the agent shows the dashboard again once they say they're done.
const connect = async (app: App, provider: ConnectPrompt) => {
  const { connectUrl } = await callTool(app, connectSchema, "connect_account", {
    provider,
  });
  await app.openLink({ url: connectUrl });
  await say(
    app,
    `I'm connecting ${titles[provider]} to wovain in my browser. Show my dashboard again once I say I'm done.`
  );
};

export const DashboardWidget = () => {
  const widget = useWidget("dashboard", dashboardResultSchema);
  return (
    <WidgetShell
      loading="Reading your shop and ads…"
      name="dashboard"
      widget={widget}
    >
      {({ app, data }) => (
        <DashboardWidgetView
          dashboard={data.dashboard}
          onConnect={async (provider) => {
            await connect(app, provider);
          }}
        />
      )}
    </WidgetShell>
  );
};
