import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@wovain/api/routers/index";

import { ENV } from "@/env";

import { authClient } from "./auth-client";
import { reportError } from "./telemetry";

// The website's oRPC API with its own types (packages/api). The session
// travels as the Cookie header from SecureStore, with credentials omitted,
// as Better Auth's Expo guide shows.
const link = new RPCLink({
  fetch: async (request, init) =>
    await globalThis.fetch(request, { ...init, credentials: "omit" }),
  headers: async () => {
    const cookie = await authClient.getCookie();
    return cookie ? { cookie } : {};
  },
  url: `${ENV.EXPO_PUBLIC_API_URL}/api/rpc`,
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);

// Every failed query and mutation reaches Error Tracking here, once, on top
// of what its screen shows the merchant.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      reportError(
        error,
        `mutation ${JSON.stringify(mutation.options.mutationKey ?? [])}`
      );
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      reportError(error, `query ${JSON.stringify(query.queryKey)}`);
    },
  }),
});
