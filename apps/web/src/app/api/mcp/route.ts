import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createRouterClient } from "@orpc/server";
import { createMcpServer } from "@wovain/api/mcp";
import { appRouter } from "@wovain/api/routers/index";
import { mcpResource } from "@wovain/auth";
import { createError } from "evlog";

import { baseContext } from "@/context";
import { ENV } from "@/env.server";
import { useLogger as getRequestLogger, withEvlog } from "@/lib/evlog";
import { auth } from "@/services";

// wovain's MCP endpoint for ChatGPT. Better Auth's MCP plugin is the OAuth
// server ChatGPT signs in with; requireMcpAuth verifies each access token
// and hands over its subject, the merchant every tool call acts for. Both
// the 2026-07-28 protocol and the 2025 stateless fallback are served.

const handler = createMcpHandler(({ authInfo }) => {
  const userId = authInfo?.extra?.["userId"];
  if (typeof userId !== "string") {
    throw createError({
      message: "MCP request without a merchant",
      status: 401,
    });
  }
  const client = createRouterClient(appRouter, {
    context: {
      ...baseContext,
      log: getRequestLogger(),
      mcpUserId: userId,
      session: null,
    },
  });
  return createMcpServer(client, {
    appUrl: ENV.BETTER_AUTH_URL,
    resourceDomains: ENV.MCP_WIDGET_RESOURCE_DOMAINS.split(",").map((host) =>
      host.trim()
    ),
  });
});

const serve = requireMcpAuth(
  auth,
  async (request, claims) => {
    const userId = claims.sub;
    if (userId === undefined) {
      return new Response("Access token has no subject", { status: 401 });
    }
    getRequestLogger().set({
      mcp: { clientId: claims["azp"] },
      user: { id: userId },
    });
    return await handler.fetch(request, {
      authInfo: {
        clientId: typeof claims["azp"] === "string" ? claims["azp"] : "",
        extra: { userId },
        scopes:
          typeof claims["scope"] === "string" ? claims["scope"].split(" ") : [],
        token: "",
      },
    });
  },
  { resource: mcpResource(ENV) }
);

export const POST = withEvlog(serve);
