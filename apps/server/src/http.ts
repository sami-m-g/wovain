import { createMcpHandler } from "@modelcontextprotocol/server";
import type { AuthInfo } from "@modelcontextprotocol/server";

import type { Env } from "./env.ts";
import type { Storage } from "./firebase.ts";
import type { Upstream } from "./lib/upstream.ts";
import { createDeps, createServer } from "./server.ts";
import { createStore } from "./store.ts";

// Streamable HTTP, one server per request, scoped to the caller's records.
// routes/mcp.ts verifies the token first; a request without a signed-in
// merchant is refused.
export const createMcpFetch = (
  env: Env,
  storage: Storage,
  upstream?: Upstream
) => {
  const deps = createDeps(env, upstream);
  const handler = createMcpHandler(({ authInfo }) => {
    const userId = authInfo?.extra?.["userId"];
    if (typeof userId !== "string" || userId === "") {
      throw new Error("no signed-in merchant");
    }
    return createServer(
      env,
      createStore(storage.db, storage.media, userId),
      deps
    );
  });
  return async (request: Request, authInfo: AuthInfo): Promise<Response> =>
    await handler.fetch(request, { authInfo });
};
