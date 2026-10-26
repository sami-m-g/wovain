import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { run } from "./seller";

// wovain's own billing. Polar is the source of truth for subscriptions and
// for which credits a merchant is granted; these tables mirror it, written
// only by its webhooks (packages/billing/src/webhooks.ts). Postgres is the
// source of truth for spending those credits: a paid step reserves credits
// atomically before it runs (packages/billing/src/credits.ts). Credits are
// whole numbers; money stays in Polar, in cents.

const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at").defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
const credits = (name: string) => bigint(name, { mode: "number" }).notNull();

// A merchant's Polar subscription (the free plan is one too), keyed by
// Polar's subscription ID. A webhook only overwrites an older copy.
export const billingSubscription = pgTable(
  "billing_subscription",
  {
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull(),
    createdAt: createdAt(),
    currentPeriodEnd: timestamp("current_period_end"),
    id: text("id").primaryKey(),
    // free, studio or label, from the product's `wovain` metadata.
    plan: text("plan").notNull(),
    // Polar's modified_at (else created_at) for the copy stored here.
    polarModifiedAt: timestamp("polar_modified_at").notNull(),
    productId: text("product_id").notNull(),
    // Polar's status: active, trialing, past_due, canceled, ...
    status: text("status").notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [index("billing_subscription_user_idx").on(table.userId)]
);

// One Polar meter-credit benefit grant: a plan's monthly credits or a credit
// pack. `remaining` is what is left of it to spend.
export const creditGrant = pgTable(
  "credit_grant",
  {
    createdAt: createdAt(),
    // Polar's benefit grant ID.
    id: text("id").primaryKey(),
    // The credit period this row holds: Polar's last_credited_at for the
    // grant. A new period replaces (or, with rollover, adds to) `remaining`.
    periodKey: text("period_key").notNull(),
    remaining: credits("remaining"),
    revokedAt: timestamp("revoked_at"),
    rollover: boolean("rollover").notNull(),
    source: text("source", { enum: ["plan", "pack"] }).notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    index("credit_grant_user_idx").on(table.userId),
    check("credit_grant_remaining_check", sql`${table.remaining} >= 0`),
  ]
);

// Which grants a reservation drew from, so a release can put credits back.
export interface CreditTake {
  credits: number;
  grantId: string;
  periodKey: string;
}

// Credits held for one paid step: settled once the step succeeds, released
// (given back) when it fails.
export const creditReservation = pgTable(
  "credit_reservation",
  {
    createdAt: createdAt(),
    credits: integer("credits").notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    status: text("status", { enum: ["held", "settled", "released"] })
      .default("held")
      .notNull(),
    // research, design or assist (packages/billing/src/plans.ts).
    step: text("step").notNull(),
    takes: jsonb("takes").$type<CreditTake[]>().notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    index("credit_reservation_user_idx").on(table.userId, table.createdAt),
    check("credit_reservation_credits_check", sql`${table.credits} > 0`),
  ]
);

// Every change to a merchant's credits, append-only: the sum of `delta` over
// a merchant equals the sum of their grants' `remaining`. The idempotency key
// makes each webhook and each reservation count once.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    createdAt: createdAt(),
    delta: credits("delta"),
    grantId: text("grant_id"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reason: text("reason", {
      enum: ["grant", "expire", "revoke", "reserve", "release"],
    }).notNull(),
    reservationId: text("reservation_id"),
    userId: owner(),
  },
  (table) => [index("credit_ledger_user_idx").on(table.userId, table.createdAt)]
);
