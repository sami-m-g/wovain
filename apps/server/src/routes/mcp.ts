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
import type { BrowserConfirm } from "../lib/browser-confirm.ts";
import { countStep, stepOf } from "../lib/funnel.ts";
import type { FunnelStep } from "../lib/funnel.ts";
import type { Connect } from "../runtime.ts";

const tracer = trace.getTracer("wovain-mcp");

// The span adds which MCP method and tool ran and how it ended. No user ids
// or arguments are recorded. Without a registered provider (see
// telemetry.ts) the tracer is a no-op.
// A tools/call also names the funnel step it marks (lib/funnel.ts).
const rpcOf = async (
  request: Request
): Promise<{ attributes: Record<string, string>; step?: FunnelStep }> => {
  if (request.method !== "POST") {
    return { attributes: {} };
  }
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  if (!isJSONRPCRequest(body) && !isJSONRPCNotification(body)) {
    return { attributes: {} };
  }
  const tool = body.params?.["name"];
  if (typeof tool !== "string") {
    return { attributes: { "mcp.method": body.method } };
  }
  const args: unknown = body.params?.["arguments"];
  const step =
    body.method === "tools/call"
      ? stepOf(
          tool,
          typeof args === "object" && args !== null ? { ...args } : {}
        )
      : undefined;
  return {
    attributes: { "mcp.method": body.method, "mcp.tool": tool },
    ...(step === undefined ? {} : { step }),
  };
};

export const createMcpRoute = (deps: {
  auth: Auth;
  env: Env;
  storage: Storage;
  confirm?: BrowserConfirm | undefined;
  connect?: Connect | undefined;
}) => {
  const { auth, confirm, connect, env, storage } = deps;
  const mcpFetch = createMcpFetch(env, storage, connect?.upstream, confirm);

  const handle = requireMcpAuth(auth, mcpFetch);

  return async (request: Request) =>
    await tracer.startActiveSpan("mcp.request", async (span) => {
      const rpc = await rpcOf(request);
      span.setAttributes(rpc.attributes);
      try {
        const response = await handle(request);
        span.setAttribute("http.response.status_code", response.status);
        if (response.status >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        } else if (response.ok && rpc.step !== undefined) {
          countStep(rpc.step);
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
