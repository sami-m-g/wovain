import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@wovain/api/routers/index";

const link = new RPCLink({
  url: () => `${window.location.origin}/api/rpc`,
});

// On the server, use the router client registered by `@/lib/orpc.server`
export const client: AppRouterClient =
  globalThis.$client ?? createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
