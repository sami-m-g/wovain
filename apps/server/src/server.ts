import { McpServer } from "@modelcontextprotocol/server";

import { registerCards } from "./cards.ts";
import type { Env } from "./env.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import type { VideoPricing } from "./lib/fal-pricing.ts";
import type { Store } from "./store.ts";
import { registerAdTools } from "./tools/ads.ts";
import { registerCampaignTools } from "./tools/campaign.ts";
import { registerDesignTools } from "./tools/design.ts";
import { registerSettingsTools } from "./tools/settings.ts";

// HTTP mode builds a server per request, so it passes one shared price cache.
export const createServer = (
  env: Env,
  store: Store,
  videoPricing: VideoPricing = createVideoPricing(env.FAL_KEY)
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
    { capabilities: { resources: {}, tools: {} } }
  );
  registerCards(server, env.WOVAIN_CARDS_DIR);
  registerSettingsTools(server, store, videoPricing);
  registerDesignTools(server, store);
  registerAdTools(server, store, env, videoPricing);
  registerCampaignTools(server, store, env);
  return server;
};
