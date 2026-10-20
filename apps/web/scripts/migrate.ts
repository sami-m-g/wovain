import { getMigrations } from "better-auth/db/migration";

import { auth } from "../lib/server.ts";

// Creates or extends Better Auth's tables (users, sessions, OAuth clients and
// tokens) in Neon, or in the local SQLite file without DATABASE_URL. Run it
// after changing auth plugins: `bun run auth:migrate`.
const { runMigrations, toBeAdded, toBeCreated } = await getMigrations(
  auth.options
);
const tables = [...toBeCreated, ...toBeAdded].map((change) => change.table);
if (tables.length === 0) {
  console.info("Auth tables are up to date.");
} else {
  await runMigrations();
  console.info(`Migrated: ${[...new Set(tables)].join(", ")}`);
}
process.exit(0);
