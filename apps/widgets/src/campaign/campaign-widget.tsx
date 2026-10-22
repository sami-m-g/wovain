import type { App } from "@modelcontextprotocol/ext-apps/react";
import {
  campaignResultSchema,
  launchApprovalSchema,
} from "@wovain/shared/campaign";
import type { Campaign } from "@wovain/shared/campaign";

import { callTool, say, useWidget } from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { CampaignWidgetView } from "./campaign-widget-view.tsx";
import type { CampaignWidgetActions } from "./campaign-widget-view.tsx";

// The merchant's press of Launch. With Meta connected to wovain, the widget
// launches itself: approve_launch mints a single-use ticket and
// launch_campaign spends only with it (both are hidden from the model), then
// the chat checks the result. Otherwise the agent launches with the host's
// Meta connector.
const launch = async (app: App, campaign: Campaign) => {
  if (campaign.launchVia !== "wovain" || campaign.campaignId === undefined) {
    await say(app, "Launch the wovain campaign");
    return;
  }
  const { launchToken } = await callTool(
    app,
    launchApprovalSchema,
    "approve_launch",
    { campaignId: campaign.campaignId }
  );
  const result = await app.callServerTool({
    arguments: { launchToken },
    name: "launch_campaign",
  });
  if (result.isError === true) {
    throw new TypeError("launch_campaign failed");
  }
  await say(app, "I launched the wovain campaign, check that it's live");
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
