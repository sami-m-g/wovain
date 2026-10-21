import type { App } from "@modelcontextprotocol/ext-apps/react";
import { campaignResultSchema } from "@wovain/shared/campaign";

import { say, useWidget } from "../lib/bridge.ts";
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
  const { app, data, error } = useWidget("campaign", campaignResultSchema);

  if (error !== null) {
    return (
      <p className="text-danger p-4 text-sm">
        The campaign widget couldn’t connect. Ask again to reload it.
      </p>
    );
  }
  if (app === null || data === undefined) {
    return (
      <p className="text-secondary p-4 text-sm">
        Putting the campaign together…
      </p>
    );
  }
  return <CampaignWidgetView campaign={data.campaign} {...actionsFor(app)} />;
};
