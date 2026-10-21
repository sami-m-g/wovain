import { requireMcpAuth } from "@better-auth/mcp";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { eq } from "drizzle-orm";

import type { Auth } from "../auth/auth.ts";
import { isAllowed, siteUrl } from "../auth/env.ts";
import type { AuthEnv } from "../auth/env.ts";
import type { Db } from "../db/client.ts";
import { user } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { createMcpFetch } from "../http.ts";
import type { Media } from "../store.ts";

const scopesOf = (claim: unknown) =>
  typeof claim === "string" ? claim.split(" ").filter(Boolean) : [];

const tracer = trace.getTracer("wovain-mcp");

// The span adds which MCP method and tool ran and how it ended. No user ids
// or arguments are recorded. Without a registered provider (see
// telemetry.ts) the tracer is a no-op.
const rpcOf = async (request: Request) => {
  if (request.method !== "POST") {
    return {};
  }
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  if (typeof body !== "object" || body === null || !("method" in body)) {
    return {};
  }
  const method = typeof body.method === "string" ? body.method : undefined;
  const params = "params" in body ? body.params : undefined;
  const tool =
    typeof params === "object" &&
    params !== null &&
    "name" in params &&
    typeof params.name === "string"
      ? params.name
      : undefined;
  return {
    ...(method === undefined ? {} : { "mcp.method": method }),
    ...(tool === undefined ? {} : { "mcp.tool": tool }),
  };
};

export const createMcpRoute = (deps: {
  auth: Auth;
  authEnv: AuthEnv;
  env: Env;
  storage: { db: Db; media: Media };
}) => {
  const { auth, authEnv, env, storage } = deps;
  const mcpFetch = createMcpFetch(env, storage);

  // Checked on every call, not only at sign-in, so taking an email off the
  // allowlist cuts off tokens that were already issued.
  const allowedUser = async (userId: string) => {
    const [row] = await storage.db
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId));
    return isAllowed(authEnv, row);
  };

  // Only requests with an access token issued for this URL reach the tools;
  // others get a 401 that points the agent at the sign-in flow.
  const handle = requireMcpAuth(
    auth,
    async (request, claims) => {
      const userId = claims.sub ?? "";
      if (!(await allowedUser(userId))) {
        return new Response("This account isn't allowed to use wovain.", {
          status: 403,
        });
      }
      return await mcpFetch(request, {
        clientId: typeof claims["azp"] === "string" ? claims["azp"] : "",
        scopes: scopesOf(claims["scope"]),
        token:
          request.headers.get("authorization")?.replace(/^Bearer /u, "") ?? "",
        userId,
      });
    },
    { resource: `${siteUrl(authEnv)}/mcp` }
  );

  return async (request: Request) =>
    await tracer.startActiveSpan("mcp.request", async (span) => {
      span.setAttributes(await rpcOf(request));
      try {
        const response = await handle(request);
        span.setAttribute("http.response.status_code", response.status);
        if (response.status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        return response;
      } catch (error) {
        // Only the error's class: messages can carry SQL values, emails or tokens.
        span.setAttribute(
          "error.type",
          error instanceof Error ? error.name : "unknown"
        );
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
};
