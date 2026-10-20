import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Db } from "./client.ts";
import { schema } from "./schema.ts";

const migrationsFolder = path.join(import.meta.dirname, "..", "migrations");

// A fresh in-memory Postgres with every migration applied, so tests run the
// same SQL as Neon without a network or credentials.
export const createTestDb = async (): Promise<Db> => {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder });
  return db;
};
