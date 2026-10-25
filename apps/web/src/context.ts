import type { Context as ApiContext } from "@wovain/api/context";

import { analytics } from "./lib/analytics";
import { auth, core, db, mailer } from "./services";

export const createContext = async (headers: Headers): Promise<ApiContext> => ({
  analytics,
  core,
  db,
  mailer,
  session: await auth.api.getSession({ headers }),
});
