import path from "node:path";

import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

// Applies packages/db/migrations to the Neon branch in DATABASE_URL:
// `bun run db:migrate` (production: point DATABASE_URL at main).
const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl === "") {
  console.error("DATABASE_URL is not set; nothing migrated.");
  process.exit(1);
}
const client = new SQL(databaseUrl);
await migrate(drizzle({ client }), {
  migrationsFolder: path.join(import.meta.dirname, "..", "migrations"),
});
await client.close();
console.info("Migrations applied.");
