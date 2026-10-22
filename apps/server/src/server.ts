import { McpServer } from "@modelcontextprotocol/server";

import type { Env } from "./env.ts";
import { createAi } from "./lib/ai.ts";
import { autopilotFor } from "./lib/autopilot-decide.ts";
import type { BrowserConfirm } from "./lib/browser-confirm.ts";
import { createDashboardCache } from "./lib/dashboard.ts";
import { designJudgeFor } from "./lib/design-judge.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import { qlooFor } from "./lib/qloo.ts";
import { trendResearchFor } from "./lib/trends.ts";
import type { Upstream } from "./lib/upstream.ts";
import { instructions, registerPlaybooks } from "./playbooks/index.ts";
import type { Store } from "./store.ts";
import { registerAdTools } from "./tools/ads.ts";
import { registerArtTools } from "./tools/art.ts";
import { registerAutopilotTools } from "./tools/autopilot.ts";
import { registerCampaignTools } from "./tools/campaign.ts";
import { registerConnectionTools } from "./tools/connections.ts";
import { registerDashboardTools } from "./tools/dashboard.ts";
import { registerDesignTools } from "./tools/design.ts";
import { registerJudgeTools } from "./tools/judge.ts";
import { registerMetaCampaignTools } from "./tools/meta.ts";
import { registerPublishTools } from "./tools/publish.ts";
import { registerResearchTools } from "./tools/research.ts";
import { registerSettingsTools } from "./tools/settings.ts";
import { registerWidgets } from "./widgets.ts";

// What the tools call upstream, built once per process: HTTP mode builds a
// server per request. One Genkit instance serves every model call. The
// upstream client reaches each merchant's own Fourthwall, fal and Meta; confirm
// makes the browser links merchants approve designs through.
export const createDeps = (
  env: Env,
  upstream?: Upstream,
  confirm?: BrowserConfirm
) => {
  const ai = createAi(env.NEBIUS_API_KEY);
  const designJudge = designJudgeFor(ai);
  const qloo = qlooFor(env.QLOO_API_KEY);
  const trendResearch = trendResearchFor(env.TAVILY_API_KEY, qloo);
  return {
    autopilot: {
      deps: autopilotFor({
        ai,
        judge: designJudge,
        research: trendResearch,
        upstream,
      }),
      on: env.WOVAIN_AUTOPILOT === "on",
    },
    confirm,
    // One per process: the server is built per request.
    dashboardCache: createDashboardCache(),
    designJudge,
    qloo,
    trendResearch,
    upstream,
    videoPricing: createVideoPricing(env.FAL_KEY),
  };
};
export type Deps = ReturnType<typeof createDeps>;

export const createServer = (
  env: Env,
  store: Store,
  {
    autopilot,
    confirm,
    dashboardCache,
    designJudge,
    qloo,
    trendResearch,
    upstream,
    videoPricing,
  }: Deps
) => {
  const server = new McpServer(
    {
      // The logo ChatGPT shows for the connector.
      icons: [
        { mimeType: "image/png", sizes: ["512x512"], src: env.WOVAIN_ICON_URL },
      ],
      name: "wovain",
      title: "wovain",
      version: "0.1.0",
    },
    { capabilities: { prompts: {}, resources: {}, tools: {} }, instructions }
  );
  registerWidgets(server, env.WOVAIN_WIDGETS_DIR);
  registerSettingsTools(server, store, videoPricing);
  registerDesignTools(server, store);
  registerArtTools(server, store, { autopilotOn: autopilot.on, upstream });
  registerPublishTools(server, store, { confirm, upstream });
  registerJudgeTools(server, designJudge);
  registerResearchTools(server, store, trendResearch, qloo);
  registerAdTools(server, store, {
    autopilotOn: autopilot.on,
    upstream,
    videoPricing,
  });
  registerCampaignTools(server, store, {
    metaAppSecret: env.META_APP_SECRET,
    upstream,
  });
  registerMetaCampaignTools(server, store, upstream);
  registerConnectionTools(server, store, upstream);
  registerAutopilotTools(server, store, { autopilot, confirm });
  registerDashboardTools(server, store, { cache: dashboardCache, upstream });
  registerPlaybooks(server);
  return server;
};
