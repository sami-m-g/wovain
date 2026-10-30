import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

// One row per voice command a merchant sends (openspec voice-commands). It
// holds no audio and no words: only who and when, so that
// - the per-merchant rate limit counts commands in Postgres, the same count on
//   every Cloud Run instance, and
// - a proposal's sealed token (whose `jti` is this row's id) is confirmed at
//   most once: confirm sets `confirmed_at` only while it is null.
// Rows older than an hour are deleted when the merchant sends the next one.
export const voiceCommand = pgTable(
  "voice_command",
  {
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("voice_command_user_idx").on(table.userId, table.createdAt)]
);
