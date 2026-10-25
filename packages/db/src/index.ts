import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations> & { $client: Pool };

export const createDb = (env: DatabaseConfig): Database =>
  drizzle(env.DATABASE_URL, { relations });
