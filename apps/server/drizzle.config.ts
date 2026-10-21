import { defineConfig } from "drizzle-kit";

// `bun run db:generate` writes SQL migrations from both schema files; they are
// committed and applied with `bun run db:migrate`.
export default defineConfig({
  dialect: "postgresql",
  out: "./migrations",
  schema: ["./src/db/app-schema.ts", "./src/db/auth-schema.ts"],
});
