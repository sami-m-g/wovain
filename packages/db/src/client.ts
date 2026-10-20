import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { schema } from "./schema.ts";

// Any Drizzle Postgres database with wovain's schema: Neon in production and
// development (Bun.SQL), PGlite in tests.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const createDb = (databaseUrl: string): Db =>
  drizzle({ client: new SQL(databaseUrl), schema });
