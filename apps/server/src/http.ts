import { timingSafeEqual } from "node:crypto";

import { createMcpHandler } from "@modelcontextprotocol/server";
import type { SQL } from "bun";

import type { Env } from "./env.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import { createServer } from "./server.ts";
import { createStore } from "./store.ts";
import type { Media } from "./store.ts";

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

// Until OAuth lands there is one merchant, the token's holder.
const OWNER = "owner";

// Streamable HTTP, one server per request. Until OAuth lands, one bearer
// token guards every request; without WOVAIN_HTTP_TOKEN nothing is served.
export const createHttpFetch = (
  env: Env,
  storage: { db: SQL; media: Media }
) => {
  const videoPricing = createVideoPricing(env.FAL_KEY);
  const handler = createMcpHandler(() =>
    createServer(
      env,
      createStore(storage.db, storage.media, OWNER),
      videoPricing
    )
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
