import { defineRelations } from "drizzle-orm";

import * as auth from "./schema/auth";
import * as seller from "./schema/seller";

export const relations = {
  ...defineRelations({ ...auth, ...seller }),
  ...auth.authRelations,
};
