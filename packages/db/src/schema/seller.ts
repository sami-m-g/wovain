import type { AdCopy } from "@wovain/core/ads";
import type { DesignBrief, Judgment } from "@wovain/core/design";
import type { TrendIdea } from "@wovain/core/trends";
import type { PendingFlow, ProviderId } from "@wovain/core/upstream";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// The seller flow: a run researches ideas, an idea becomes a design, an
// approved design becomes a Fourthwall product, and a published product gets
// a paused Meta campaign. Shapes owned by @wovain/core are stored as jsonb.

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
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

// A merchant's grant on Fourthwall, Meta or fal; the tokens are sealed.
export const connection = pgTable(
  "connection",
  {
    connectedAt: createdAt(),
    id: id(),
    // The provider refused the grant and wouldn't refresh it: the merchant
    // must reconnect. Cleared when a new grant is saved.
    needsReconnect: boolean("needs_reconnect").default(false).notNull(),
    provider: text("provider").$type<ProviderId>().notNull(),
    sealedTokens: text("sealed_tokens").notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    uniqueIndex("connection_user_provider_idx").on(
      table.userId,
      table.provider
    ),
  ]
);

// An authorization in progress, keyed by its OAuth state.
export const connectionFlow = pgTable("connection_flow", {
  codeVerifier: text("code_verifier"),
  createdAt: createdAt(),
  discoveryState:
    jsonb("discovery_state").$type<PendingFlow["discoveryState"]>(),
  expiresAt: timestamp("expires_at").notNull(),
  provider: text("provider").$type<ProviderId>().notNull(),
  returnTo: text("return_to").notNull(),
  state: text("state").primaryKey(),
  userId: owner(),
});

// One pass of the flow from a seed; autopilot lets Nemotron approve.
export const run = pgTable(
  "run",
  {
    autopilot: boolean("autopilot").default(false).notNull(),
    createdAt: createdAt(),
    // Where the run executes: the durable Mastra workflow, or the legacy
    // in-request flow while the mastra-runs flag is off. Its resume goes to
    // the same engine.
    engine: text("engine", { enum: ["legacy", "mastra"] })
      .default("legacy")
      .notNull(),
    error: text("error"),
    id: id(),
    // false: the merchant ran without Qloo (the LLM-only comparison,
    // qloo-taste-map), so a retry runs without it too.
    qloo: boolean("qloo").default(true).notNull(),
    seed: text("seed").notNull(),
    status: text("status", {
      enum: ["running", "awaiting_approval", "completed", "failed"],
    })
      .default("running")
      .notNull(),
    step: text("step"),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [index("run_user_idx").on(table.userId)]
);

export type RunStatus = (typeof run.$inferSelect)["status"];

export const idea = pgTable(
  "idea",
  {
    // Names Qloo matched for the seed: never printed.
    avoidNames: jsonb("avoid_names").$type<string[]>().notNull(),
    createdAt: createdAt(),
    id: id(),
    rank: integer("rank").notNull(),
    research: jsonb("research").$type<TrendIdea>().notNull(),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    score: real("score").notNull(),
    seed: text("seed").notNull(),
    theme: text("theme").notNull(),
    userId: owner(),
  },
  (table) => [index("idea_user_idx").on(table.userId)]
);

export const design = pgTable(
  "design",
  {
    artworkHeight: integer("artwork_height").notNull(),
    artworkUrl: text("artwork_url").notNull(),
    artworkWidth: integer("artwork_width").notNull(),
    brief: jsonb("brief").$type<DesignBrief>().notNull(),
    createdAt: createdAt(),
    decidedBy: text("decided_by", { enum: ["merchant", "autopilot"] }),
    decisionReason: text("decision_reason"),
    id: id(),
    ideaId: text("idea_id")
      .notNull()
      .references(() => idea.id, { onDelete: "cascade" }),
    // The caller's request (or the run step) that made this row: a retry with
    // the same key gets this row back instead of a second one.
    idempotencyKey: text("idempotency_key").unique(),
    judgment: jsonb("judgment").$type<Judgment>().notNull(),
    // Fourthwall's placement preview: the art on the blank its product will
    // use. Null on designs drawn before previews existed.
    mockupStatus: text("mockup_status", {
      enum: ["ready", "failed", "not_connected"],
    }),
    mockups: jsonb("mockups").$type<string[]>().default([]).notNull(),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    status: text("status", {
      enum: ["pending_approval", "approved", "rejected"],
    })
      .default("pending_approval")
      .notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [index("design_user_idx").on(table.userId)]
);

export const product = pgTable(
  "product",
  {
    catalogProductId: text("catalog_product_id").notNull(),
    createdAt: createdAt(),
    customizationId: text("customization_id").notNull(),
    designId: text("design_id")
      .notNull()
      .references(() => design.id, { onDelete: "cascade" }),
    id: id(),
    // The caller's request (or the run step) that made this row: a retry with
    // the same key gets this row back instead of a second one.
    idempotencyKey: text("idempotency_key").unique(),
    mediaUri: text("media_uri").notNull(),
    mockups: jsonb("mockups").$type<string[]>().notNull(),
    offerId: text("offer_id").notNull(),
    price: real("price").notNull(),
    productUrl: text("product_url"),
    status: text("status", { enum: ["hidden", "public"] })
      .default("hidden")
      .notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [index("product_user_idx").on(table.userId)]
);

export const campaign = pgTable(
  "campaign",
  {
    adAccountId: text("ad_account_id").notNull(),
    adIds: jsonb("ad_ids").$type<string[]>().notNull(),
    adSetId: text("ad_set_id").notNull(),
    copy: jsonb("copy").$type<AdCopy>().notNull(),
    createdAt: createdAt(),
    creativeIds: jsonb("creative_ids").$type<string[]>().notNull(),
    dailyBudgetCents: integer("daily_budget_cents").notNull(),
    id: id(),
    // The caller's request (or the run step) that made this row: a retry with
    // the same key gets this row back instead of a second one.
    idempotencyKey: text("idempotency_key").unique(),
    metaCampaignId: text("meta_campaign_id").notNull(),
    pageId: text("page_id").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    // Meta's delivery as last read back (@wovain/core/media-buying): staged
    // campaigns are "draft" or "paused"; only an approved activation makes
    // one "publishing", "in_review" or "active". A text column, so a new
    // state needs no migration.
    status: text("status", {
      enum: [
        "draft",
        "paused",
        "publishing",
        "in_review",
        "active",
        "with_issues",
        "archived",
        "unknown",
      ],
    })
      .default("paused")
      .notNull(),
    userId: owner(),
  },
  (table) => [index("campaign_user_idx").on(table.userId)]
);
