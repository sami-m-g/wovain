import { timingSafeEqual } from "node:crypto";

import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  originValidationResponse,
} from "@modelcontextprotocol/server";

import type { Env } from "./env.ts";
import { createServer } from "./server.ts";
import type { Store } from "./store.ts";

const tokenMatches = (header: string | null, token: string) => {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// HTTP fallback (spec.md > Important Failure Modes): bearer token on every
// request, and Host/Origin checks against localhost plus the tunnel's host,
// so a tunnel or a DNS-rebinding page can't drive the merchant's shop and ads.
export const createHttpFetch = (env: Env, store: Store, token: string) => {
  const handler = createMcpHandler(() => createServer(env, store));
  const allowedHosts = [
    ...localhostAllowedHostnames(),
    ...env.WOVAIN_HTTP_ALLOWED_HOSTS,
  ];
  return async (request: Request): Promise<Response> => {
    const rejected =
      hostHeaderValidationResponse(request, allowedHosts) ??
      originValidationResponse(request, allowedHosts);
    if (rejected !== undefined) {
      return rejected;
    }
    if (!tokenMatches(request.headers.get("authorization"), token)) {
      return new Response("Unauthorized", {
        headers: { "www-authenticate": "Bearer" },
        status: 401,
      });
    }
    return await handler.fetch(request);
  };
};
