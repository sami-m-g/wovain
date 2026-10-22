import type { App } from "@modelcontextprotocol/ext-apps/react";
import { adResultSchema, ratioLabel } from "@wovain/shared/ad";

import { callTool, say, useWidget } from "../lib/bridge.ts";
import { WidgetShell } from "../lib/widget-shell.tsx";
import { AdWidgetView } from "./ad-widget-view.tsx";
import type { AdWidgetActions } from "./ad-widget-view.tsx";

// Approve and Skip are recorded by wovain directly; the chat messages tell the
// ads playbook, which revises a concept on feedback and builds the campaign
// on "Create the campaign".
const actionsFor = (app: App): AdWidgetActions => ({
  onCreateCampaign: async () => {
    await say(app, "Create the campaign");
  },
  onDecide: async (ad, conceptId, status) => {
    const result = await callTool(app, adResultSchema, "record_ad", {
      conceptId,
      designId: ad.designId,
      status,
    });
    await say(
      app,
      `${status === "approved" ? "Approved" : "Skipped"} ad ${conceptId} for design ${ad.designId}`
    );
    return result.ad;
  },
  onFeedback: async (ad, conceptId, feedback) => {
    await say(
      app,
      `Feedback on ad ${conceptId} for design ${ad.designId}: ${feedback}`
    );
  },
  onFullscreen: async (on) => {
    await app.requestDisplayMode({ mode: on ? "fullscreen" : "inline" });
  },
  onRetry: async (ad, conceptId, asset) => {
    await say(
      app,
      `Retry the ${ratioLabel(asset.ratio)} ${asset.kind} of ad ${conceptId} for design ${ad.designId}`
    );
  },
});

export const AdWidget = () => {
  const widget = useWidget("ad", adResultSchema);
  return (
    <WidgetShell loading="Putting the ads together…" name="ad" widget={widget}>
      {({ app, data }) => <AdWidgetView ad={data.ad} {...actionsFor(app)} />}
    </WidgetShell>
  );
};
