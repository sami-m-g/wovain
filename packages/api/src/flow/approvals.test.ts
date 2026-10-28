import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { WovainEvent } from "@wovain/core/events";
import { DecisionTrace } from "@wovain/core/trace";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import {
  auditEvent,
  decisionTrace,
  performanceSnapshot,
} from "@wovain/db/schema/autonomy";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "./actor";
import {
  approvalsFor,
  autonomyOf,
  setAutonomy,
  spendToDate,
  traceSinkFor,
} from "./approvals";

// The approval queue, autonomy settings, spend and traces on real Postgres
// (PGlite, with the app's migrations).

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

// One day of a Meta campaign's spend.
const day = (date: string, spendCents: number, entityId = "c1") => ({
  date,
  entityId,
  level: "campaign" as const,
  source: "meta" as const,
  spendCents,
  userId: USER_ID,
});

const setup = async () => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  const sent: WovainEvent[] = [];
  const actor = {
    db: db as unknown as Database,
    events: {
      send: (event: WovainEvent) => {
        sent.push(event);
        return Promise.resolve();
      },
    },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, sent };
};

describe("approvals on Postgres", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("starts at suggest with no spend, and audits a settings change", async () => {
    expect(await autonomyOf(ctx.actor)).toEqual({
      dailySpendCapCents: 0,
      level: "suggest",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const next = {
      dailySpendCapCents: 2000,
      level: "publish_ads_paused" as const,
      monthlySpendCapCents: 30_000,
      paused: false,
    };
    await setAutonomy(ctx.actor, next);
    await setAutonomy(ctx.actor, { ...next, paused: true });
    expect(await autonomyOf(ctx.actor)).toEqual({ ...next, paused: true });
    const audits = await ctx.db.select().from(auditEvent);
    expect(audits.map((row) => row.event)).toEqual([
      "settings_changed",
      "settings_changed",
    ]);
  });

  it("queues, dedupes and decides an approval", async () => {
    const approvals = approvalsFor(ctx.actor);
    const settings = await autonomyOf(ctx.actor);
    const input = {
      idempotencyKey: "refund:T4YTE8HA",
      payload: { orderId: "T4YTE8HA" },
      proposedBy: "store_agent" as const,
      title: "Refund order T4YTE8HA",
      type: "store.order.refund" as const,
      userId: USER_ID,
    };
    const first = await approvals.enqueue(input, settings);
    const again = await approvals.enqueue(input, settings);
    expect(again).toMatchObject({
      approval: { id: first.approval.id },
      created: false,
    });
    const pending = await approvals.list({
      statuses: ["pending"],
      userId: USER_ID,
    });
    expect(pending).toHaveLength(1);
    const decided = await approvals.decide(
      {
        approvalId: first.approval.id,
        approve: true,
        decidedBy: USER_ID,
        userId: USER_ID,
      },
      settings
    );
    expect(decided.status).toBe("approved");
    expect(decided.decidedAt).toBeInstanceOf(Date);
    expect(ctx.sent.map((event) => event.name)).toEqual([
      "wovain/approval.requested",
      "wovain/approval.decided",
    ]);
    await expect(
      approvals.decide(
        {
          approvalId: first.approval.id,
          approve: false,
          decidedBy: USER_ID,
          userId: USER_ID,
        },
        settings
      )
    ).rejects.toMatchObject({ code: "NOT_PENDING" });
  });

  it("sums today's and this month's Meta campaign spend", async () => {
    await ctx.db
      .insert(performanceSnapshot)
      .values([
        day("2026-10-28", 1500),
        day("2026-10-28", 500, "c2"),
        day("2026-10-02", 4000),
        day("2026-09-30", 9000),
      ]);
    expect(
      await spendToDate(ctx.actor, new Date("2026-10-28T18:00:00Z"))
    ).toEqual({ daysLeftInMonth: 4, monthCents: 6000, todayCents: 2000 });
  });

  it("saves a decision trace", async () => {
    const trace = new DecisionTrace(
      { runId: undefined, userId: USER_ID },
      traceSinkFor(ctx.actor)
    );
    trace.add({
      agent: "optimizer",
      inputSummary: "3 ads, 7 days",
      model: "nvidia/test",
      output: { pause: ["ad_2"] },
      sources: [{ id: "ad_2", provider: "meta" }],
      step: "sample",
    });
    await trace.flush();
    const rows = await ctx.db.select().from(decisionTrace);
    expect(rows).toMatchObject([
      {
        agent: "optimizer",
        ok: true,
        output: { pause: ["ad_2"] },
        seq: 0,
        sources: [{ id: "ad_2", provider: "meta" }],
      },
    ]);
  });
});
