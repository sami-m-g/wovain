import type { App } from "@modelcontextprotocol/ext-apps/react";
import { adResultSchema } from "@wovain/shared/ad";
import type { Ad, AdStatus } from "@wovain/shared/ad";

import { callTool, say, useCard } from "../lib/bridge.ts";
import { AdCardView } from "./ad-card-view.tsx";
import type { AdCardActions } from "./ad-card-view.tsx";

const record = async (app: App, ad: Ad, status: AdStatus) => {
  const result = await callTool(app, adResultSchema, "record_ad", {
    designId: ad.designId,
    status,
  });
  return result.ad;
};

// Add and Skip are recorded by wovain directly; the chat message tells the
// wovain-ads skill, which launches the campaign after the last ad card.
const actionsFor = (app: App): AdCardActions => ({
  onAdd: async (ad) => {
    const saved = await record(app, ad, "added");
    await say(app, `Added the ads for design ${ad.designId} to the campaign`);
    return saved;
  },
  onFeedback: async (ad, feedback) => {
    await say(
      app,
      `Feedback on the ads for design ${ad.designId}: ${feedback}`
    );
  },
  onFullscreen: async (on) => {
    await app.requestDisplayMode({ mode: on ? "fullscreen" : "inline" });
  },
  onRetry: async (ad, slot) => {
    await say(app, `Retry video ${slot} for design ${ad.designId}`);
  },
  onSkip: async (ad) => {
    const saved = await record(app, ad, "skipped");
    await say(app, `Skipped the ads for design ${ad.designId}`);
    return saved;
  },
});

export const AdCard = () => {
  const { app, data, error } = useCard("ad", adResultSchema);

  if (error !== null) {
    return (
      <p className="text-danger p-4 text-sm">
        The ad card couldn’t connect. Ask again to reload it.
      </p>
    );
  }
  if (app === null || data === undefined) {
    return (
      <p className="text-secondary p-4 text-sm">Putting the ads together…</p>
    );
  }
  return <AdCardView ad={data.ad} {...actionsFor(app)} />;
};
