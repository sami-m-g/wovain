import { createRouterClient } from "@orpc/server";
import { appRouter } from "@wovain/api/routers/index";

import { createContext } from "@/context";
import { useLogger as getRequestLogger } from "@/lib/evlog";

// The oRPC router called in-process from a route handler, as the browser's
// signed-in merchant, logging onto the request's wide event.
export const routerClientFor = async (request: Request) =>
  createRouterClient(appRouter, {
    context: {
      ...(await createContext(request.headers)),
      log: getRequestLogger(),
    },
  });
