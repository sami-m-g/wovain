import type { Context as ApiContext } from "@wovain/api/context";

import { analytics } from "./lib/analytics";
import { auth, billing, core, db, mailer, runs } from "./services";

// The services every procedure call gets; callers spread it and add who the
// call acts for (a session, or an MCP merchant) and, in a request, its logger.
export const baseContext = {
  analytics,
  billing,
  core,
  db,
  mailer,
  runs,
} satisfies Omit<ApiContext, "session">;

export const createContext = async (headers: Headers): Promise<ApiContext> => ({
  ...baseContext,
  session: await auth.api.getSession({ headers }),
});
