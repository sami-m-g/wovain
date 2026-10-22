import type { App } from "@modelcontextprotocol/ext-apps/react";
import { campaignResultSchema } from "@wovain/shared/campaign";

import { say, useWidget } from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { CampaignWidgetView } from "./campaign-widget-view.tsx";
import type { CampaignWidgetActions } from "./campaign-widget-view.tsx";

// Launch and re-check go through chat, where the campaign playbook holds
// the Meta tools; the widget never publishes anything itself.
const actionsFor = (app: App): CampaignWidgetActions => ({
  onLaunch: async () => {
    await say(app, "Launch the wovain campaign");
  },
  onOpen: async (url) => {
    await app.openLink({ url });
  },
  onRecheck: async () => {
    await say(app, "I fixed the campaign blockers, check again");
  },
});

export const CampaignWidget = () => {
  const widget = useWidget("campaign", campaignResultSchema);
  return (
    <WidgetShell
      loading="Putting the campaign together…"
      name="campaign"
      widget={widget}
    >
      {({ app, data }) => (
        <CampaignWidgetView campaign={data.campaign} {...actionsFor(app)} />
      )}
    </WidgetShell>
  );
};
