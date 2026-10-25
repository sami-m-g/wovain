import { createAuthMiddleware } from "evlog/better-auth";
import type { BetterAuthInstance } from "evlog/better-auth";

import { useLogger as getRequestLogger } from "@/lib/evlog";
import { auth } from "@/services";

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

export const identifyEvlogUser = async (request: Request) => {
  await identifyUser(
    getRequestLogger(),
    request.headers,
    new URL(request.url).pathname
  );
};
