// Preloaded into the web server's process (`node --import`, see
// playwright.config.ts and apps/web's e2e:start), so MSW answers every call
// the server makes to an outside provider. Calls to this machine (the app
// itself, Postgres, the Inngest Dev Server) pass through; any other call
// without a handler gets a 599, so a test never reaches a real provider.
import { HttpResponse, http, passthrough } from "msw";
import { setupServer } from "msw/node";

import { handlers } from "./handlers.ts";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

setupServer(
  ...handlers,
  http.all("*", ({ request }) => {
    if (LOCAL_HOSTS.has(new URL(request.url).hostname)) {
      return passthrough();
    }
    process.stderr.write(`[e2e] unmocked ${request.method} ${request.url}\n`);
    return HttpResponse.json({ error: "Not mocked in e2e" }, { status: 599 });
  })
).listen();
