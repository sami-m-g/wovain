import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import {
  environmentManager,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query";
import type { AppRouterClient } from "@wovain/api/routers/index";
import { toast } from "sonner";

const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });

let browserQueryClient: QueryClient | undefined;

export const getQueryClient = () => {
  if (environmentManager.isServer()) {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
};

const link = new RPCLink({
  url: () => `${window.location.origin}/api/rpc`,
});

// On the server, use the router client registered by `@/lib/orpc.server`
const client: AppRouterClient = globalThis.$client ?? createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
