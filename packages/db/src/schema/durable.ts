import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { run } from "./seller";

// Durable runs: each write to a provider (Fourthwall, Meta, fal) is keyed
// before it is sent. A retried step finds the key and reuses the result, or,
// when the earlier attempt died with the outcome unknown, looks the object up
// on the provider before sending it again. Run state itself lives in the
// workflow engine (Mastra on Inngest); this only guards the side effects.
export const externalWrite = pgTable(
  "external_write",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    key: text("key").primaryKey(),
    operation: text("operation").notNull(),
    provider: text("provider", {
      enum: ["fal", "fourthwall", "meta", "nebius"],
    }).notNull(),
    result: jsonb("result"),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    // pending: sent, outcome unknown; done: result saved; compensated: undone
    // after the run failed for good.
    state: text("state", { enum: ["pending", "done", "compensated"] })
      .default("pending")
      .notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("external_write_run_idx").on(table.runId)]
);
