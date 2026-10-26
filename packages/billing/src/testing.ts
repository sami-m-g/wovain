import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { creditGrant, creditLedger } from "@wovain/db/schema/billing";
import { eq, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// A throwaway Postgres (PGlite, in memory) with every migration applied, so
// the tests run the real schema, constraints and SQL.

const MIGRATIONS = fileURLToPath(
  new URL("../../db/src/migrations", import.meta.url)
);

export const createTestDb = async () => {
  const client = new PGlite();
  const pglite = drizzle({ client, relations });
  await migrate(pglite, { migrationsFolder: MIGRATIONS });
  // The flow code takes the app's node-postgres type; PGlite's drizzle
  // database has the same query API.
  const db = pglite as unknown as Database;
  return {
    close: async () => await client.close(),
    db,
    // Empties every table that hangs off a user, so one migrated database
    // serves a whole test file (migrating is the slow part).
    reset: async () => {
      await client.exec('TRUNCATE "user" CASCADE');
    },
  };
};

export const addUser = async (db: Database, id: string) => {
  await db.insert(user).values({
    email: `${id}@example.com`,
    emailVerified: true,
    id,
    name: id,
  });
  return id;
};

// The two sides of the ledger: what the entries add up to, and what the
// grants hold. They must always agree.
export const ledgerTotals = async (db: Database, userId: string) => {
  const [entries] = await db
    .select({ total: sum(creditLedger.delta).mapWith(Number) })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  const [grants] = await db
    .select({ total: sum(creditGrant.remaining).mapWith(Number) })
    .from(creditGrant)
    .where(eq(creditGrant.userId, userId));
  return { grants: grants?.total ?? 0, ledger: entries?.total ?? 0 };
};
