import { timingSafeEqual } from "node:crypto";

import { createMcpHandler } from "@modelcontextprotocol/server";

import type { Env } from "./env.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import { createServer } from "./server.ts";
import type { Store } from "./store.ts";

const tokenMatches = (header: string | null, token: string) => {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const unauthorized = () =>
  new Response("Unauthorized", {
    headers: { "www-authenticate": "Bearer" },
    status: 401,
  });

// Streamable HTTP, one server per request. Until OAuth lands, one bearer
// token guards every request; without WOVAIN_HTTP_TOKEN nothing is served.
export const createHttpFetch = (env: Env, store: Store) => {
  const videoPricing = createVideoPricing(env.FAL_KEY);
  const handler = createMcpHandler(() =>
    createServer(env, store, videoPricing)
  );
  const token = env.WOVAIN_HTTP_TOKEN;
  return async (request: Request): Promise<Response> => {
    if (
      token === undefined ||
      !tokenMatches(request.headers.get("authorization"), token)
    ) {
      return unauthorized();
    }
    return await handler.fetch(request);
  };
};
