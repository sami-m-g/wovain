import { integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

// One JSON record per row (spec.md > Data Model): settings, staged artwork,
// designs, ads and the campaign, each checked against its zod schema on read.
export const records = pgTable(
  "records",
  {
    data: jsonb("data").notNull(),
    id: text("id").notNull(),
    kind: text("kind").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind, table.id] })]
);

// Hands out per-merchant ids (d1, d2, a1…) atomically.
export const counters = pgTable(
  "counters",
  {
    kind: text("kind").notNull(),
    n: integer("n").notNull(),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind] })]
);
