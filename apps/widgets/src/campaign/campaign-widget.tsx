import type { App } from "@modelcontextprotocol/ext-apps/react";
import {
  campaignResultSchema,
  launchRequestSchema,
} from "@wovain/shared/campaign";
import type { Campaign } from "@wovain/shared/campaign";

import { callTool, say, useWidget } from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { CampaignWidgetView } from "./campaign-widget-view.tsx";
import type { CampaignWidgetActions } from "./campaign-widget-view.tsx";

// The merchant's press of Launch. With Meta connected to wovain, the widget
// opens wovain's confirm page, where the merchant signs in and confirms in
// their own browser; only that confirmation lets launch_campaign spend.
// Otherwise the agent launches with the host's Meta connector.
const launch = async (app: App, campaign: Campaign) => {
  if (campaign.launchVia !== "wovain") {
    await say(app, "Launch the wovain campaign");
    return;
  }
  const { confirmUrl } = await callTool(
    app,
    launchRequestSchema,
    "request_launch",
    {}
  );
  await app.openLink({ url: confirmUrl });
  await say(
    app,
    "I'm confirming the wovain campaign launch in my browser. Launch it once I say I confirmed."
  );
};

const actionsFor = (app: App): CampaignWidgetActions => ({
  onLaunch: async (campaign) => {
    await launch(app, campaign);
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
