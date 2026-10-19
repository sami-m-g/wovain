import { McpServer } from "@modelcontextprotocol/server";

import { registerCards } from "./cards.ts";
import type { Env } from "./env.ts";
import type { Store } from "./store.ts";
import { registerDesignTools } from "./tools/design.ts";
import { registerSettingsTools } from "./tools/settings.ts";

export const createServer = (env: Env, store: Store) => {
  const server = new McpServer(
    { name: "wovain", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } }
  );
  registerCards(server, env.WOVAIN_CARDS_DIR);
  registerSettingsTools(server, store);
  registerDesignTools(server, store);
  return server;
};
