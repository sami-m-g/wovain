import "varlock/auto-load";
import { defineConfig } from "drizzle-kit";

import { ENV } from "./src/env";

export default defineConfig({
  dbCredentials: {
    url: ENV.DATABASE_URL,
  },
  dialect: "postgresql",
  out: "./src/migrations",
  schema: "./src/schema",
  schemaFilter: ["public"],
});
