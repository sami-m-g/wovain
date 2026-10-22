import { McpServer } from "@modelcontextprotocol/server";

import type { Env } from "./env.ts";
import { designJudgeFor } from "./lib/design-judge.ts";
import type { DesignJudge } from "./lib/design-judge.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import type { VideoPricing } from "./lib/fal-pricing.ts";
import { trendResearchFor } from "./lib/trends.ts";
import type { TrendResearch } from "./lib/trends.ts";
import { instructions, registerPlaybooks } from "./playbooks/index.ts";
import type { Store } from "./store.ts";
import { registerAdTools } from "./tools/ads.ts";
import { registerCampaignTools } from "./tools/campaign.ts";
import { registerDesignTools } from "./tools/design.ts";
import { registerJudgeTools } from "./tools/judge.ts";
import { registerResearchTools } from "./tools/research.ts";
import { registerSettingsTools } from "./tools/settings.ts";
import { registerWidgets } from "./widgets.ts";

// HTTP mode builds a server per request, so it passes one shared price cache
// one design judge and one trend research; anything left out is built here.
export const createServer = (
  env: Env,
  store: Store,
  {
    designJudge = designJudgeFor(env.NEBIUS_API_KEY),
    trendResearch = trendResearchFor(env.TAVILY_API_KEY, env.NEBIUS_API_KEY),
    videoPricing = createVideoPricing(env.FAL_KEY),
  }: {
    designJudge?: DesignJudge | undefined;
    trendResearch?: TrendResearch | undefined;
    videoPricing?: VideoPricing;
  } = {}
) => {
  const server = new McpServer(
    {
      // The logo ChatGPT shows for the connector.
      ...(env.WOVAIN_ICON_URL === undefined
        ? {}
        : {
            icons: [
              {
                mimeType: "image/png",
                sizes: ["512x512"],
                src: env.WOVAIN_ICON_URL,
              },
            ],
          }),
      name: "wovain",
      title: "wovain",
      version: "0.1.0",
    },
    { capabilities: { prompts: {}, resources: {}, tools: {} }, instructions }
  );
  registerWidgets(server, env.WOVAIN_WIDGETS_DIR);
  registerSettingsTools(server, store, videoPricing);
  registerDesignTools(server, store);
  registerJudgeTools(server, designJudge);
  registerResearchTools(server, trendResearch);
  registerAdTools(server, store, env, videoPricing);
  registerCampaignTools(server, store, env);
  registerPlaybooks(server);
  return server;
};
