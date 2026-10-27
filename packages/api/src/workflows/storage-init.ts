import { initMastraSchema } from "@wovain/api/workflows/storage";

// `pnpm --filter @wovain/api storage:init`: Mastra's schema on DATABASE_URL,
// run by the migrate jobs after Drizzle's migrations (the deploy pipeline)
// and by hand on a local database. Exits non-zero when it fails.

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL isn't set");
}
await initMastraSchema(url);
process.stdout.write("Mastra storage schema is ready\n");
