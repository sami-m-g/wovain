import { createRouterClient } from "@orpc/server";
import type { RouterClient } from "@orpc/server";
import { appRouter } from "@wovain/api/routers/index";
import { headers } from "next/headers";

import { createContext } from "@/context";

declare global {
  // Server-side router client, registered once per server process
  var $client: RouterClient<typeof appRouter> | undefined;
}

// Lets server rendering call procedures directly instead of over HTTP
globalThis.$client = createRouterClient(appRouter, {
  context: async () => createContext(await headers()),
});
