import type { App } from "@modelcontextprotocol/ext-apps/react";
import { campaignResultSchema } from "@wovain/shared/campaign";

import { say, useCard } from "../lib/bridge.ts";
import { CampaignCardView } from "./campaign-card-view.tsx";
import type { CampaignCardActions } from "./campaign-card-view.tsx";

// Launch and re-check go through chat, where the wovain-campaign skill holds
// the Meta tools; the card never publishes anything itself.
const actionsFor = (app: App): CampaignCardActions => ({
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

export const CampaignCard = () => {
  const { app, data, error } = useCard("campaign", campaignResultSchema);

  if (error !== null) {
    return (
      <p className="text-danger p-4 text-sm">
        The campaign card couldn’t connect. Ask again to reload it.
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
  return <CampaignCardView campaign={data.campaign} {...actionsFor(app)} />;
};
