import { createApprovals } from "@wovain/core/approvals";
import type {
  Approval,
  ApprovalStatus,
  ApprovalStore,
  AuditEntry,
} from "@wovain/core/approvals";
import { DEFAULT_AUTONOMY } from "@wovain/core/autonomy";
import type { AutonomySettings, SpendToDate } from "@wovain/core/autonomy";
import type { CampaignStatus } from "@wovain/core/media-buying";
import type { TraceSink } from "@wovain/core/trace";
import {
  approval,
  auditEvent,
  autonomySetting,
  decisionTrace,
  performanceSnapshot,
} from "@wovain/db/schema/autonomy";
import { campaign } from "@wovain/db/schema/seller";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { flagContextOf } from "./flags";

// The approval queue, autonomy settings and decision traces on Postgres
// (@wovain/core/approvals, ./autonomy, ./trace). Workstreams call
// `approvalsFor(actor)` to enqueue actions and record outcomes, and
// `traceSinkFor(actor)` to save a DecisionTrace.

const MAX_LIST = 100;

type Row = typeof approval.$inferSelect;

const toApproval = (row: Row): Approval => row;

// The queue's storage, scoped by user on every read and write.
export const drizzleApprovalStore = (db: Actor["db"]): ApprovalStore => ({
  audit: async (entry: AuditEntry) => {
    await db.insert(auditEvent).values(entry);
  },
  get: async (userId, id) => {
    const [row] = await db
      .select()
      .from(approval)
      .where(and(eq(approval.userId, userId), eq(approval.id, id)));
    return row === undefined ? undefined : toApproval(row);
  },
  insert: async (row) => {
    const [created] = await db
      .insert(approval)
      .values(row)
      .onConflictDoNothing()
      .returning();
    if (created !== undefined) {
      return { approval: toApproval(created), created: true };
    }
    const key = row.idempotencyKey;
    const [earlier] =
      key === null
        ? []
        : await db
            .select()
            .from(approval)
            .where(
              and(
                eq(approval.userId, row.userId),
                eq(approval.idempotencyKey, key)
              )
            );
    if (earlier === undefined) {
      throw new Error(`The approval for ${row.actionType} was not saved`);
    }
    return { approval: toApproval(earlier), created: false };
  },
  list: async ({ domain, limit, statuses, userId }) => {
    const rows = await db
      .select()
      .from(approval)
      .where(
        and(
          eq(approval.userId, userId),
          statuses === undefined || statuses.length === 0
            ? undefined
            : inArray(approval.status, [...statuses]),
          domain === undefined ? undefined : eq(approval.domain, domain)
        )
      )
      .orderBy(desc(approval.createdAt))
      .limit(Math.min(limit ?? MAX_LIST, MAX_LIST));
    return rows.map(toApproval);
  },
  update: async (userId, id, from, patch) => {
    const [row] = await db
      .update(approval)
      .set(patch)
      .where(
        and(
          eq(approval.userId, userId),
          eq(approval.id, id),
          inArray(approval.status, [...from])
        )
      )
      .returning();
    return row === undefined ? undefined : toApproval(row);
  },
});

// The approval service for one merchant's requests and steps.
export const approvalsFor = (actor: Actor) =>
  createApprovals({
    emit: actor.events?.send,
    store: drizzleApprovalStore(actor.db),
  });

// The merchant's autonomy settings, or the defaults (suggest, no spend).
export const autonomyOf = async (
  actor: Pick<Actor, "db" | "userId">
): Promise<AutonomySettings> => {
  const [row] = await actor.db
    .select()
    .from(autonomySetting)
    .where(eq(autonomySetting.userId, actor.userId));
  if (row === undefined) {
    return DEFAULT_AUTONOMY;
  }
  const { dailySpendCapCents, level, monthlySpendCapCents, paused } = row;
  return { dailySpendCapCents, level, monthlySpendCapCents, paused };
};

export const setAutonomy = async (
  actor: Pick<Actor, "db" | "userId">,
  next: AutonomySettings
): Promise<AutonomySettings> => {
  const before = await autonomyOf(actor);
  await actor.db
    .insert(autonomySetting)
    .values({ ...next, userId: actor.userId })
    .onConflictDoUpdate({ set: next, target: autonomySetting.userId });
  await actor.db.insert(auditEvent).values({
    actor: actor.userId,
    after: next,
    approvalId: null,
    before,
    event: "settings_changed",
    note: null,
    userId: actor.userId,
  });
  return next;
};

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

// Campaigns that can spend, or may be: Meta delivers (or reviews, or
// publishes) them, or wovain can't tell. A campaign that's draft, paused or
// archived spends nothing.
const SPENDING: CampaignStatus[] = [
  "active",
  "in_review",
  "publishing",
  "with_issues",
  "unknown",
];
// Activations approved but not yet on Meta: their budget is committed too.
const COMMITTING: ApprovalStatus[] = ["approved", "executing"];

// The daily budgets wovain has committed, one per campaign: campaigns that
// can spend, plus approved activations still on their way to Meta.
const committedDailyCents = async ({
  db,
  userId,
}: Pick<Actor, "db" | "userId">) => {
  const [running, starting] = await Promise.all([
    db
      .select({ cents: campaign.dailyBudgetCents, id: campaign.id })
      .from(campaign)
      .where(
        and(eq(campaign.userId, userId), inArray(campaign.status, SPENDING))
      ),
    db
      .select({ payload: approval.payload })
      .from(approval)
      .where(
        and(
          eq(approval.userId, userId),
          eq(approval.actionType, "media.campaign.activate"),
          inArray(approval.status, COMMITTING)
        )
      ),
  ]);
  const budgets = new Map(running.map((row) => [row.id, row.cents]));
  for (const { payload } of starting) {
    const id = payload["campaignId"];
    const cents = payload["spendCents"];
    if (typeof id === "string" && typeof cents === "number") {
      budgets.set(id, Math.max(budgets.get(id) ?? 0, cents));
    }
  }
  let total = 0;
  for (const cents of budgets.values()) {
    total += cents;
  }
  return total;
};

const daysInMonth = (now: Date) =>
  new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
  ).getUTCDate();

// Ad spend wovain has committed today and this month (UTC), across every
// campaign: the caps (@wovain/core/autonomy) are checked against it.
// - Today: the committed daily budgets, or Meta's reported spend for today
//   when that is higher (a campaign paused today has already spent).
// - Month: Meta's reported spend before today, plus today, plus the
//   committed daily budgets for each day left after today.
// Meta's spend comes from the campaign-level performance snapshots.
export const spendToDate = async (
  actor: Pick<Actor, "db" | "userId">,
  now = new Date()
): Promise<SpendToDate> => {
  const monthStart = `${isoDay(now).slice(0, 7)}-01`;
  const today = isoDay(now);
  const [[row], committed] = await Promise.all([
    actor.db
      .select({
        beforeTodayCents: sql<number>`coalesce(sum(${performanceSnapshot.spendCents}) filter (where ${performanceSnapshot.date} < ${today}), 0)::int`,
        todayCents: sql<number>`coalesce(sum(${performanceSnapshot.spendCents}) filter (where ${performanceSnapshot.date} = ${today}), 0)::int`,
      })
      .from(performanceSnapshot)
      .where(
        and(
          eq(performanceSnapshot.userId, actor.userId),
          eq(performanceSnapshot.source, "meta"),
          eq(performanceSnapshot.level, "campaign"),
          gte(performanceSnapshot.date, monthStart)
        )
      ),
    committedDailyCents(actor),
  ]);
  const daysLeftInMonth = daysInMonth(now) - now.getUTCDate() + 1;
  const todayCents = Math.max(Number(row?.todayCents ?? 0), committed);
  return {
    daysLeftInMonth,
    monthCents:
      Number(row?.beforeTodayCents ?? 0) +
      todayCents +
      committed * (daysLeftInMonth - 1),
    todayCents,
  };
};

// Saves a DecisionTrace's entries (@wovain/core/trace) for this merchant.
export const traceSinkFor =
  (actor: { db: Pick<Actor["db"], "insert"> }): TraceSink =>
  async (scope, entries) => {
    if (entries.length === 0) {
      return;
    }
    await actor.db.insert(decisionTrace).values(
      entries.map((entry) => ({
        agent: entry.agent,
        approvalId: scope.approvalId ?? null,
        at: entry.at,
        dropId: scope.dropId ?? null,
        inputSummary: entry.inputSummary,
        model: entry.model ?? null,
        ms: entry.ms ?? null,
        ok: entry.ok,
        output: entry.output,
        runId: scope.runId ?? null,
        seq: entry.seq,
        sources: entry.sources,
        step: entry.step,
        suggestionId: scope.suggestionId ?? null,
        userId: scope.userId,
      }))
    );
  };

// The approval queue and autonomy settings are behind the
// autonomy-approvals flag (dev and next only, for now).
export const autonomyApprovalsOff = () =>
  createError({
    fix: "Turn on the autonomy-approvals flag for this environment.",
    message: "Approvals aren't available yet",
    status: 404,
    why: "The autonomy-approvals flag is off.",
  });

export const requireAutonomyApprovals = async (actor: Actor) => {
  if (
    !(await actor.core.flags.isOn("autonomy-approvals", flagContextOf(actor)))
  ) {
    throw autonomyApprovalsOff();
  }
};
