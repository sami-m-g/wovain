import { createMcpHandler } from "@modelcontextprotocol/server";

import type { Db } from "./db/client.ts";
import type { Env } from "./env.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import { createServer } from "./server.ts";
import { createStore } from "./store.ts";
import type { Media } from "./store.ts";

// Who the verified access token belongs to; routes/mcp.ts checks the token first.
export interface Caller {
  clientId: string;
  scopes: string[];
  token: string;
  userId: string;
}

// Streamable HTTP, one server per request, scoped to the caller's records.
// The handler never reads credentials itself: a request without a verified
// caller is refused.
export const createMcpFetch = (env: Env, storage: { db: Db; media: Media }) => {
  const videoPricing = createVideoPricing(env.FAL_KEY);
  const handler = createMcpHandler(({ authInfo }) => {
    const userId = authInfo?.extra?.["userId"];
    if (typeof userId !== "string" || userId === "") {
      throw new Error("no signed-in merchant");
    }
    return createServer(
      env,
      createStore(storage.db, storage.media, userId),
      videoPricing
    );
  });
  return async (request: Request, caller: Caller): Promise<Response> =>
    await handler.fetch(request, {
      authInfo: {
        clientId: caller.clientId,
        extra: { userId: caller.userId },
        scopes: caller.scopes,
        token: caller.token,
      },
    });
};
