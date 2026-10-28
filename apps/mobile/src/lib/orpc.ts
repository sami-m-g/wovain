import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@wovain/api/routers/index";

import { ENV } from "@/env";

import { authClient } from "./auth-client";

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

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});
