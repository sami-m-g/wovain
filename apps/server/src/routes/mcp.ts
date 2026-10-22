import {
  isJSONRPCNotification,
  isJSONRPCRequest,
} from "@modelcontextprotocol/server";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import { requireMcpAuth } from "../auth/auth.ts";
import type { Auth } from "../auth/auth.ts";
import type { Env } from "../env.ts";
import type { Storage } from "../firebase.ts";
import { createMcpFetch } from "../http.ts";

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
  if (!isJSONRPCRequest(body) && !isJSONRPCNotification(body)) {
    return {};
  }
  const tool = body.params?.["name"];
  return {
    "mcp.method": body.method,
    ...(typeof tool === "string" ? { "mcp.tool": tool } : {}),
  };
};

export const createMcpRoute = (deps: {
  auth: Auth;
  env: Env;
  storage: Storage;
}) => {
  const { auth, env, storage } = deps;
  const mcpFetch = createMcpFetch(env, storage);

  const handle = requireMcpAuth(auth, mcpFetch);

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
