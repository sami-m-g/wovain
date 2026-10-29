import type { AlertChannel, AlertSettings } from "@wovain/core/alerts";
import type {
  ApprovalProposer,
  ApprovalStatus,
  AuditEventKind,
  CostPreview,
} from "@wovain/core/approvals";
import type {
  ActionDomain,
  ActionType,
  AutonomyLevel,
  PolicyReason,
  RiskClass,
} from "@wovain/core/autonomy";
import type { TriggerKind } from "@wovain/core/events";
import type { TraceSource } from "@wovain/core/trace";
import {
  boolean,
  date,
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
import { campaign, design, product, run } from "./seller";

// The shared foundation of the autonomy work (openspec
// foundation-autonomy-approvals): the brand profile, autonomy settings,
// suggestions, the one approval queue with its audit log, drops, decision
// traces, device push tokens, the ads optimizer's state and performance
// snapshots. Workstreams add columns here by migration; they don't add
// parallel tables. Money is in US cents (integer).

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

// A Qloo entity the brand's taste resolved to.
export interface QlooEntityRef {
  id: string;
  name: string;
  // Qloo's type URN, e.g. urn:entity:artist.
  type: string;
  // The free-text reference it was resolved from.
  from?: string | undefined;
  // Qloo's affinity or popularity, 0 to 1, when it gave one.
  score?: number | undefined;
}

// Who the brand sells to (Qloo audience demographics, the merchant's own
// answer), used for Meta targeting and the ad persona.
export interface BrandDemographics {
  ageMin?: number | undefined;
  ageMax?: number | undefined;
  // Qloo's age buckets with their affinity, e.g. { "25_to_29": 0.4 }.
  ageAffinity?: Record<string, number> | undefined;
  genders?: ("female" | "male" | "all")[] | undefined;
  countries?: string[] | undefined;
}

// The brand wizard's answers, one row per merchant.
export const brandProfile = pgTable("brand_profile", {
  createdAt: createdAt(),
  demographics: jsonb("demographics")
    .$type<BrandDemographics>()
    .default({})
    .notNull(),
  // A short brand name the merchant chose, if any.
  displayName: text("display_name"),
  id: id(),
  // Market niches, e.g. "y2k racing", "cottagecore".
  niches: jsonb("niches").$type<string[]>().default([]).notNull(),
  // When the merchant reached the wizard's last step; until then the
  // overview sends them back to the wizard.
  onboardedAt: timestamp("onboarded_at"),
  // Up to 6 hex colors, e.g. "#1A1A1A".
  palette: jsonb("palette").$type<string[]>().default([]).notNull(),
  qlooEntities: jsonb("qloo_entities")
    .$type<QlooEntityRef[]>()
    .default([])
    .notNull(),
  // Free-text taste references: artists, films, brands, places.
  tasteReferences: jsonb("taste_references")
    .$type<string[]>()
    .default([])
    .notNull(),
  updatedAt: updatedAt(),
  userId: owner().unique(),
  // Tone of voice for copy, e.g. "dry, lowercase, no emoji".
  voice: text("voice"),
});

// Each taste reference wovain has resolved to Qloo entities
// (@wovain/core/brand-identity), one row per reference (trimmed, lowercase),
// shared by every merchant. It saves repeat calls to Qloo, Tavily and
// Nemotron, and counts the lookups each merchant started, for the rate limit.
export const tasteReference = pgTable(
  "taste_reference",
  {
    createdAt: createdAt(),
    entities: jsonb("entities").$type<QlooEntityRef[]>().default([]).notNull(),
    // A provider failed while resolving it: it is looked up again soon.
    failed: boolean("failed").default(false).notNull(),
    id: id(),
    key: text("key").notNull().unique(),
    // The spelling it was first resolved from.
    reference: text("reference").notNull(),
    resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
    // The merchant whose lookup resolved it last.
    resolvedBy: text("resolved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    sources: jsonb("sources").$type<TraceSource[]>().default([]).notNull(),
    status: text("status").$type<"direct" | "proxy" | "unresolved">().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("taste_reference_resolved_by_idx").on(
      table.resolvedBy,
      table.resolvedAt
    ),
  ]
);

// How far wovain acts alone (@wovain/core/autonomy), one row per merchant.
// No row means DEFAULT_AUTONOMY.
export const autonomySetting = pgTable("autonomy_setting", {
  // The merchant's overrides of the ads profit rules' thresholds
  // (@wovain/core/ad-rules AdRuleOverrides); empty means the defaults.
  adRules: jsonb("ad_rules")
    .$type<Record<string, number>>()
    .default({})
    .notNull(),
  // The merchant's alert channels per type and quiet hours
  // (@wovain/core/alerts AlertSettings); null means the defaults.
  alerts: jsonb("alerts").$type<AlertSettings>(),
  createdAt: createdAt(),
  dailySpendCapCents: integer("daily_spend_cap_cents").default(0).notNull(),
  id: id(),
  level: text("level").$type<AutonomyLevel>().default("suggest").notNull(),
  // Stop every campaign once ad spend minus the profit of its sales reaches
  // this (@wovain/core/ad-rules). $50 until the merchant sets it.
  lossLimitCents: integer("loss_limit_cents").default(5000).notNull(),
  monthlySpendCapCents: integer("monthly_spend_cap_cents").default(0).notNull(),
  // The merchant's "pause the agent" switch.
  paused: boolean("paused").default(false).notNull(),
  updatedAt: updatedAt(),
  userId: owner().unique(),
});

// Something wovain thinks the merchant should do, from a trigger. Accepting
// one queues an approval or starts a run.
export const suggestion = pgTable(
  "suggestion",
  {
    approvalId: text("approval_id"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at"),
    id: id(),
    // What it proposes, e.g. "drop", "retire", "reprice", "extend",
    // "promote", "scale_ad".
    kind: text("kind").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    // Why, in one or two sentences, shown on the card.
    rationale: text("rationale").notNull(),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    sources: jsonb("sources").$type<TraceSource[]>().default([]).notNull(),
    status: text("status", {
      enum: ["new", "accepted", "dismissed", "expired"],
    })
      .default("new")
      .notNull(),
    title: text("title").notNull(),
    trigger: text("trigger").$type<TriggerKind>().notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    index("suggestion_user_status_idx").on(table.userId, table.status),
  ]
);

// A drop: a capsule of products that share a palette, mark and style
// family, published together (as a Fourthwall collection).
export const drop = pgTable(
  "drop",
  {
    // The drop-level brief: theme, story, art direction.
    brief: jsonb("brief").$type<Record<string, unknown>>(),
    // The Fourthwall collection it is published as.
    collectionId: text("collection_id"),
    createdAt: createdAt(),
    id: id(),
    name: text("name").notNull(),
    palette: jsonb("palette").$type<string[]>().default([]).notNull(),
    qlooTags: jsonb("qloo_tags").$type<string[]>().default([]).notNull(),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    status: text("status", {
      enum: ["draft", "in_review", "live", "paused", "retired"],
    })
      .default("draft")
      .notNull(),
    // A style family from a fixed list (design-drops), e.g. "streetwear".
    styleFamily: text("style_family"),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [index("drop_user_idx").on(table.userId)]
);

// One product of a drop: a blank, its print regions and colors.
export const dropItem = pgTable(
  "drop_item",
  {
    catalogProductId: text("catalog_product_id").notNull(),
    colors: jsonb("colors").$type<string[]>().default([]).notNull(),
    createdAt: createdAt(),
    designId: text("design_id").references(() => design.id, {
      onDelete: "set null",
    }),
    dropId: text("drop_id")
      .notNull()
      .references(() => drop.id, { onDelete: "cascade" }),
    id: id(),
    position: integer("position").default(0).notNull(),
    priceCents: integer("price_cents"),
    productId: text("product_id").references(() => product.id, {
      onDelete: "set null",
    }),
    // Print regions to their art, e.g. { back: { assetUrl, placementId } }.
    regions: jsonb("regions")
      .$type<Record<string, Record<string, unknown>>>()
      .default({})
      .notNull(),
    status: text("status", {
      enum: ["draft", "ready", "published", "failed"],
    })
      .default("draft")
      .notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [index("drop_item_drop_idx").on(table.dropId)]
);

// The one approval queue: store actions, media buying and autopilot
// (@wovain/core/approvals).
export const approval = pgTable(
  "approval",
  {
    actionType: text("action_type").$type<ActionType>().notNull(),
    costPreview: jsonb("cost_preview").$type<CostPreview>(),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at"),
    // A user ID, or "policy".
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    domain: text("domain").$type<ActionDomain>().notNull(),
    dropId: text("drop_id").references(() => drop.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    expiresAt: timestamp("expires_at"),
    id: id(),
    idempotencyKey: text("idempotency_key"),
    inverse: jsonb("inverse").$type<Record<string, unknown>>(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    policyReason: text("policy_reason").$type<PolicyReason>().notNull(),
    proposedBy: text("proposed_by").$type<ApprovalProposer>().notNull(),
    reason: text("reason"),
    result: jsonb("result"),
    risk: text("risk").$type<RiskClass>().notNull(),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    status: text("status").$type<ApprovalStatus>().default("pending").notNull(),
    suggestionId: text("suggestion_id").references(() => suggestion.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    index("approval_user_status_idx").on(table.userId, table.status),
    uniqueIndex("approval_user_idempotency_idx").on(
      table.userId,
      table.idempotencyKey
    ),
  ]
);

// Append-only: every change to an approval, and to autonomy settings.
export const auditEvent = pgTable(
  "audit_event",
  {
    // A user ID, "policy", or a proposer (autopilot, optimizer …).
    actor: text("actor").notNull(),
    after: jsonb("after"),
    approvalId: text("approval_id").references(() => approval.id, {
      onDelete: "set null",
    }),
    before: jsonb("before"),
    createdAt: createdAt(),
    event: text("event").$type<AuditEventKind>().notNull(),
    id: id(),
    note: text("note"),
    userId: owner(),
  },
  (table) => [
    index("audit_event_user_idx").on(table.userId, table.createdAt),
    index("audit_event_approval_idx").on(table.approvalId),
  ]
);

// One step of a decision trace (@wovain/core/trace).
export const decisionTrace = pgTable(
  "decision_trace",
  {
    agent: text("agent").notNull(),
    approvalId: text("approval_id").references(() => approval.id, {
      onDelete: "set null",
    }),
    at: timestamp("at").notNull(),
    createdAt: createdAt(),
    dropId: text("drop_id").references(() => drop.id, {
      onDelete: "set null",
    }),
    id: id(),
    inputSummary: text("input_summary").notNull(),
    model: text("model"),
    ms: integer("ms"),
    ok: boolean("ok").default(true).notNull(),
    output: jsonb("output"),
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    seq: integer("seq").notNull(),
    sources: jsonb("sources").$type<TraceSource[]>().default([]).notNull(),
    step: text("step").notNull(),
    suggestionId: text("suggestion_id").references(() => suggestion.id, {
      onDelete: "set null",
    }),
    userId: owner(),
  },
  (table) => [
    index("decision_trace_run_idx").on(table.runId),
    index("decision_trace_approval_idx").on(table.approvalId),
    index("decision_trace_drop_idx").on(table.dropId),
    index("decision_trace_user_idx").on(table.userId, table.createdAt),
  ]
);

// A phone or browser that gets push notifications (Expo push tokens).
export const device = pgTable(
  "device",
  {
    createdAt: createdAt(),
    id: id(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    platform: text("platform", { enum: ["ios", "android", "web"] }).notNull(),
    token: text("token").notNull().unique(),
    userId: owner(),
  },
  (table) => [index("device_user_idx").on(table.userId)]
);

// The merchant's Telegram chat with wovain's bot (openspec alerts). Settings
// writes a one-time link token (its SHA-256, never the token) for the deep
// link t.me/<bot>?start=<token>; the bot's webhook finds it on /start and
// saves the chat.
export const telegramChat = pgTable("telegram_chat", {
  // Telegram's chat id, once the merchant pressed Start.
  chatId: text("chat_id"),
  createdAt: createdAt(),
  id: id(),
  linkExpiresAt: timestamp("link_expires_at"),
  linkTokenHash: text("link_token_hash").unique(),
  linkedAt: timestamp("linked_at"),
  updatedAt: updatedAt(),
  userId: owner().unique(),
  // The merchant's @username, shown in Settings.
  username: text("username"),
});

// One alert on one channel (openspec alerts): written once it was sent, so
// a retried or repeated event never sends it twice, and kept when it was
// skipped or failed for good.
export const alertDelivery = pgTable(
  "alert_delivery",
  {
    channel: text("channel").$type<AlertChannel>().notNull(),
    createdAt: createdAt(),
    error: text("error"),
    id: id(),
    // The notify event's dedupeKey, or its id.
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    status: text("status", { enum: ["sent", "skipped", "failed"] }).notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    uniqueIndex("alert_delivery_key_idx").on(
      table.userId,
      table.key,
      table.channel
    ),
  ]
);

// The ads optimizer's state per ad: a Beta(alpha, beta) posterior over its
// conversion rate for Thompson sampling, plus the counts it was fit on.
export const adOptimizerState = pgTable(
  "ad_optimizer_state",
  {
    // Beta posterior parameters; the prior can come from Qloo affinity.
    alpha: real("alpha").default(1).notNull(),
    beta: real("beta").default(1).notNull(),
    campaignId: text("campaign_id").references(() => campaign.id, {
      onDelete: "cascade",
    }),
    clicks: integer("clicks").default(0).notNull(),
    conversions: integer("conversions").default(0).notNull(),
    createdAt: createdAt(),
    id: id(),
    impressions: integer("impressions").default(0).notNull(),
    // Meta's learning phase: no reallocation while it is learning.
    learning: boolean("learning").default(true).notNull(),
    metaAdId: text("meta_ad_id").notNull(),
    metaAdSetId: text("meta_ad_set_id").notNull(),
    // Free-form optimizer parameters (priors, last sample, version).
    params: jsonb("params")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    spendCents: integer("spend_cents").default(0).notNull(),
    status: text("status", { enum: ["active", "paused", "retired"] })
      .default("active")
      .notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
    // Its current share of the ad set's budget, 0 to 1.
    weight: real("weight").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("ad_optimizer_state_ad_idx").on(table.userId, table.metaAdId),
  ]
);

// A day of results for one entity, from Meta or Fourthwall: the optimizer,
// the feedback loop, the spend caps and the dashboard read these.
export const performanceSnapshot = pgTable(
  "performance_snapshot",
  {
    addToCarts: integer("add_to_carts").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    createdAt: createdAt(),
    // The day it covers, in UTC.
    date: date("date").notNull(),
    // The Meta or Fourthwall ID of the entity.
    entityId: text("entity_id").notNull(),
    id: id(),
    impressions: integer("impressions").default(0).notNull(),
    level: text("level", {
      enum: ["ad", "ad_set", "campaign", "product", "drop"],
    }).notNull(),
    // wovain's product row, when the entity maps to one.
    productId: text("product_id").references(() => product.id, {
      onDelete: "set null",
    }),
    purchases: integer("purchases").default(0).notNull(),
    // The provider's raw row, for fields not modeled yet.
    raw: jsonb("raw"),
    revenueCents: integer("revenue_cents").default(0).notNull(),
    sessions: integer("sessions").default(0).notNull(),
    source: text("source", { enum: ["meta", "fourthwall"] }).notNull(),
    spendCents: integer("spend_cents").default(0).notNull(),
    units: integer("units").default(0).notNull(),
    updatedAt: updatedAt(),
    userId: owner(),
  },
  (table) => [
    uniqueIndex("performance_snapshot_entity_day_idx").on(
      table.userId,
      table.source,
      table.level,
      table.entityId,
      table.date
    ),
  ]
);
