import { defineRelations } from "drizzle-orm";

import * as schema from "./schema/auth";

export const relations = {
  ...defineRelations(schema),
  ...schema.authRelations,
};
