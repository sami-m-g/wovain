import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { loadEnv } from "./env.ts";
import { createHttpFetch } from "./http.ts";
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
} else if (env.WOVAIN_HTTP_TOKEN === undefined) {
  console.error(
    "wovain: HTTP mode needs WOVAIN_HTTP_TOKEN (32+ characters); not starting."
  );
  process.exit(1);
} else {
  // Fallback when the desktop-only install isn't available. Local only: ngrok
  // reaches it on 127.0.0.1 (spec.md > Important Failure Modes).
  Bun.serve({
    fetch: createHttpFetch(env, store, env.WOVAIN_HTTP_TOKEN),
    hostname: "127.0.0.1",
    port: env.WOVAIN_HTTP_PORT,
  });
  console.error(
    `wovain listening on http://127.0.0.1:${env.WOVAIN_HTTP_PORT}/mcp`
  );
}
