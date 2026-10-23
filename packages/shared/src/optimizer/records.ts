import { z } from "zod";

import { evidenceSourceSchema, trendRowSchema } from "./snapshot.ts";

// The optimizer's Firestore records (spec section 8), under
// users/{uid}/optimization/state. Each parses on read; every field added later
// has a default, so old documents still parse (no migrations).

export const entitySchema = z.object({
  id: z.string(),
  kind: z.enum(["ad", "design", "campaign", "product", "shop"]),
});
export type Entity = z.infer<typeof entitySchema>;
export const entityKey = (entity: Entity) => `${entity.kind}:${entity.id}`;

export const confidences = ["high", "medium", "low", "unknown"] as const;
export const confidenceSchema = z.enum(confidences);
export type Confidence = z.infer<typeof confidenceSchema>;

export const findingPatterns = [
  "ad_no_sale",
  "clicks_no_sale",
  "no_click",
  "unsettled_spend",
  "creative_fatigue",
  "single_concept",
  "source_disagreement",
  "tracking_gap",
  "missed_sale",
  "size_mix_erodes_margin",
  "low_aov",
  "winner_capped",
  "over_breakeven",
  "blank_out_of_stock",
  "color_discontinued",
  "restocked",
  "fulfillment_delay",
  "production_error",
  "shipping_issue",
  "refund_spike",
  "chargeback",
  "seasonal_end",
  "seasonal_cutoff",
  "shop_wide",
  "trend_shift",
] as const;
export const findingPatternSchema = z.enum(findingPatterns);
export type FindingPattern = z.infer<typeof findingPatternSchema>;

export const evidenceSchema = z.object({
  label: z.string(),
  source: evidenceSourceSchema,
  value: z.union([z.number(), z.string(), z.boolean()]),
});
export type Evidence = z.infer<typeof evidenceSchema>;

// What code found: one pattern on one entity, with the rule that raised it.
export const findingSchema = z.object({
  entity: entitySchema,
  evidence: z.array(evidenceSchema).default([]),
  // The numbers code computed for the menu (spend per day, counts, prices).
  facts: z.record(z.string(), z.number()).default({}),
  pattern: findingPatternSchema,
  rule: z.string(),
  // Whether the data it rests on has settled (kills need it).
  settled: z.boolean().default(true),
});
export type Finding = z.infer<typeof findingSchema>;
export const findingKey = (finding: Finding) =>
  `${finding.pattern}:${entityKey(finding.entity)}`;

// findings/{id}: a finding over time, open until a later run no longer sees it.
export const findingRecordSchema = findingSchema.extend({
  closedAt: z.int().optional(),
  id: z.string(),
  openedAt: z.int(),
  status: z.enum(["open", "closed"]).default("open"),
});

export const diagnosisSchema = z.object({
  cause: z.string(),
  confidence: confidenceSchema,
  evidence: z.array(
    z.object({ ref: z.string(), source: evidenceSourceSchema })
  ),
  findingId: z.string(),
  missing: z.array(z.string()).default([]),
  runId: z.string(),
  what: z.string().max(500),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

export const actionTypes = [
  "pause_ad",
  "resume_ad",
  "pause_product_ads",
  "resume_product_ads",
  "budget_up",
  "budget_down",
  "pause_design",
  "quality_check",
  "ops_alert",
  "refresh_creative",
  "ab_test",
  "audience_change",
  "price_change",
  "bundle_offer",
  "hold",
  "fix_tracking",
] as const;
export const actionTypeSchema = z.enum(actionTypes);
export type ActionType = z.infer<typeof actionTypeSchema>;

export const riskSchema = z.enum(["safe", "risky", "advice", "none"]);
export type Risk = z.infer<typeof riskSchema>;

export const actionStatuses = [
  "proposed",
  "approved",
  "applying",
  "applied",
  "dismissed",
  "expired",
  "stale",
  "failed",
  "rolled_back",
] as const;

// The remote state an action expects; a mismatch at apply time makes it stale.
export const preconditionSchema = z.object({
  dailyBudget: z.number().optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
  stock: z.enum(["in_stock", "out_of_stock", "discontinued"]).optional(),
});

export const impactSchema = z.object({
  base: z.number(),
  downside: z.number(),
  note: z.string().optional(),
  unit: z.enum(["usd", "usd_per_day", "none"]),
  upside: z.number().optional(),
});
export type Impact = z.infer<typeof impactSchema>;

// A candidate, fully specified by code (menu.ts).
export const candidateSchema = z.object({
  amount: z.number().optional(),
  expectedImpact: impactSchema,
  findingId: z.string().optional(),
  id: z.string(),
  idempotencyKey: z.string(),
  precondition: preconditionSchema.default({}),
  risk: riskSchema,
  rollback: actionTypeSchema.optional(),
  rule: z.string(),
  target: entitySchema,
  type: actionTypeSchema,
  // Hours until it's measured; undefined waits for the next review or a restock.
  windowHours: z.int().min(0).optional(),
});
export type Candidate = z.infer<typeof candidateSchema>;

// actions/{id}.
export const actionRecordSchema = candidateSchema.extend({
  appliedAt: z.int().optional(),
  baseline: z.record(z.string(), z.number()).optional(),
  createdAt: z.int(),
  decidedBy: z.enum(["optimizer", "merchant", "host"]).optional(),
  expiresAt: z.int().optional(),
  measureAt: z.int().optional(),
  reason: z.string().max(500).optional(),
  responseIds: z.array(z.string()).default([]),
  status: z.enum(actionStatuses).default("proposed"),
});
export type ActionRecord = z.infer<typeof actionRecordSchema>;

// outcomes/{actionId}.
export const outcomeSchema = z.object({
  actionId: z.string(),
  after: z.record(z.string(), z.number()),
  before: z.record(z.string(), z.number()),
  confidence: confidenceSchema,
  control: z.record(z.string(), z.number()).optional(),
  label: z.enum(["improved", "no_change", "worse", "inconclusive"]),
  measuredAt: z.int(),
});

// memory/{featureKey}, e.g. `hook:cat-dad`, `blank:gildan-64000`.
export const memorySchema = z.object({
  featureKey: z.string(),
  lastOutcome: outcomeSchema.shape.label.optional(),
  losses: z.int().min(0).default(0),
  refundRate: z.number().min(0).max(1).default(0),
  score: z.number().min(0).max(1).default(0.5),
  trials: z.int().min(0).default(0),
  updatedAt: z.int(),
  wins: z.int().min(0).default(0),
});

// inbox/{id}: what needs the merchant.
export const inboxItemSchema = z.object({
  createdAt: z.int(),
  id: z.string(),
  kind: z.enum(["approval", "block", "ops_alert", "outcome"]),
  refId: z.string(),
  seenAt: z.int().optional(),
  title: z.string().max(200),
  urgent: z.boolean().default(false),
});

export const runSchema = z.object({
  errors: z.array(z.string()).default([]),
  events: z.array(z.string()).default([]),
  finishedAt: z.int().optional(),
  id: z.string(),
  modelReplies: z.array(z.unknown()).default([]),
  overrides: z.array(z.string()).default([]),
  reason: z.string(),
  startedAt: z.int(),
  status: z.enum(["running", "done", "failed", "deferred"]),
  steps: z.array(z.string()).default([]),
});

// One change the optimizer made to a Meta object today (guardrails.ts).
export const changeSchema = z.object({
  at: z.int(),
  // Kill and operations pauses both count toward maxAutoPausesPerDay.
  kind: z.enum(["kill_pause", "ops_pause", "resume", "budget"]),
  objectId: z.string(),
  pct: z.number().optional(),
});
export type Change = z.infer<typeof changeSchema>;

// An open reconciliation check that blocks kills on an entity.
export const blockSchema = z.object({
  check: z.string(),
  dismissedReason: z.string().max(500).optional(),
  entityKey: z.string(),
  since: z.int(),
});
export type Block = z.infer<typeof blockSchema>;

export const quotaSchema = z.object({
  day: z.iso.date().optional(),
  model: z.int().default(0),
  qloo: z.int().default(0),
  reviews: z.int().default(0),
  runs: z.int().default(0),
  tavily: z.int().default(0),
  upstream: z.int().default(0),
});

// optimization/state.
export const stateSchema = z.object({
  activeUntil: z.int().optional(),
  blocks: z.array(blockSchema).default([]),
  changes: z.array(changeSchema).default([]),
  cursors: z.record(z.string(), z.string()).default({}),
  lastReviewAt: z.int().optional(),
  lastRunAt: z.int().optional(),
  leaseUntil: z.int().optional(),
  // What the last observation read from each source, for the report.
  observed: z
    .record(
      z.string(),
      z.object({
        at: z.int(),
        rows: z.int().min(0).default(0),
        state: z.enum(["connected", "missing", "error"]),
      })
    )
    .default({}),
  quota: quotaSchema.prefault({}),
});
export type OptimizerState = z.infer<typeof stateSchema>;

// hooks/{provider}: webhook registration; the secret only as ciphertext.
export const hookSchema = z.object({
  error: z.string().max(500).optional(),
  lastDeliveryAt: z.int().optional(),
  provider: z.enum(["fourthwall", "meta"]),
  secretCiphertext: z.string().optional(),
  status: z.enum(["registered", "polling", "failed", "off"]),
  webhookId: z.string().optional(),
});

// optimizerDue/{uid}: the scheduler's index, no merchant data.
export const optimizerDueSchema = z.object({
  activeUntil: z.int().default(0),
  enabled: z.boolean(),
  reviewHourUtc: z.int().min(0).max(23).default(7),
});

// fourthwallShops/{shopId}, metaAdAccounts/{actId}: webhook routing only.
export const routeSchema = z.object({ uid: z.string() });

// trendCache/{nicheKey}/days/{date}: shared across merchants.
export const trendCacheSchema = z.object({
  fetchedAt: z.int(),
  rows: z.array(trendRowSchema),
});
