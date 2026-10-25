import type { Context as ApiContext } from "@wovain/api/context";

import { auth, core, db, mailer } from "./services";

export const createContext = async (headers: Headers): Promise<ApiContext> => ({
  core,
  db,
  mailer,
  session: await auth.api.getSession({ headers }),
});
