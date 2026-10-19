import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { loadEnv } from "./env.ts";
import { createServer } from "./server.ts";
import { createStore } from "./store.ts";

// stdout is the MCP channel: log to stderr only.
const env = loadEnv();
const store = createStore(env.WOVAIN_DATA_DIR);

if (env.WOVAIN_HTTP_PORT === undefined) {
  serveStdio(() => createServer(env, store), {
    onerror: (error) => {
      console.error(error);
    },
  });
} else {
  // Fallback when the desktop-only install isn't available: run over HTTP and
  // expose it with ngrok for chatgpt.com (spec.md > Important Failure Modes).
  const handler = createMcpHandler(() => createServer(env, store));
  Bun.serve({
    fetch: async (request) => await handler.fetch(request),
    port: env.WOVAIN_HTTP_PORT,
  });
  console.error(
    `wovain listening on http://localhost:${env.WOVAIN_HTTP_PORT}/mcp`
  );
}
