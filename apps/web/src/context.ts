import type { Context as ApiContext } from "@wovain/api/context";

import { auth, db } from "./services";

export const createContext = async (headers: Headers): Promise<ApiContext> => ({
  db,
  session: await auth.api.getSession({ headers }),
});
