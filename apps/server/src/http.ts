import { createMcpHandler } from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";

import type { Env } from "./env.ts";
import type { Storage } from "./firebase.ts";
import { designJudgeFor } from "./lib/design-judge.ts";
import { createVideoPricing } from "./lib/fal-pricing.ts";
import { trendResearchFor } from "./lib/trends.ts";
import { createServer } from "./server.ts";
import { createStore } from "./store.ts";

// Streamable HTTP, one server per request, scoped to the caller's records.
// routes/mcp.ts verifies the token first; a request without a signed-in
// merchant is refused.
export const createMcpFetch = (env: Env, storage: Storage) => {
  const videoPricing = createVideoPricing(env.FAL_KEY);
  const designJudge = designJudgeFor(env.NEBIUS_API_KEY);
  const trendResearch = trendResearchFor(
    env.TAVILY_API_KEY,
    env.NEBIUS_API_KEY
  );
  const handler = createMcpHandler(({ authInfo }) => {
    const userId = authInfo?.extra?.["userId"];
    if (typeof userId !== "string" || userId === "") {
      throw new Error("no signed-in merchant");
    }
    return createServer(env, createStore(storage.db, storage.media, userId), {
      designJudge,
      trendResearch,
      videoPricing,
    });
  });
  return async (request: Request, authInfo: AuthInfo): Promise<Response> =>
    await handler.fetch(request, { authInfo });
};
