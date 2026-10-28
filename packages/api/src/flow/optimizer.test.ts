import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { WovainEvent } from "@wovain/core/events";
import { seededRng } from "@wovain/core/optimizer";
import { fakeNemotron } from "@wovain/core/test-doubles";
import type { ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import {
  adOptimizerState,
  approval,
  auditEvent,
  decisionTrace,
} from "@wovain/db/schema/autonomy";
import { campaign, design, idea, product } from "@wovain/db/schema/seller";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "./actor";
import { approvalsFor, autonomyOf, setAutonomy } from "./approvals";
import {
  executeOptimizerApproval,
  finishOptimizerApproval,
  optimizeMerchant,
  writeOptimizerApproval,
} from "./optimizer";

// The optimizer's flow on real Postgres (PGlite, the app's migrations), with
// a fake Meta and a fake reviewer.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const NOW = new Date("2026-10-28T12:00:00Z");
const DAY_MS = 86_400_000;
const REASONING_MODEL = "nvidia/reasoning-test";

interface MetaAd {
  spend: string;
  clicks: number;
  effective_status: string;
  id: string;
  impressions: number;
}

const fakeMeta = (ads: MetaAd[], campaignStatus = "ACTIVE") => {
  const writes: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = async (tool, args) => {
    if (tool === "ads_update_entity") {
      writes.push({ args, tool });
      return await Promise.resolve({ success: true });
    }
    const replies: Record<string, unknown> = {
      ad: { data: ads },
      adset: {
        data: [
          {
            id: "set1",
            learning_stage_info: { status: "SUCCESS" },
            results: 120,
          },
        ],
      },
      campaign: {
        data: [
          { daily_budget: "1000", effective_status: campaignStatus, id: "mc1" },
        ],
      },
    };
    return await Promise.resolve(replies[String(args.level)]);
  };
  return {
    meta: async <T>(work: (c: ToolCall) => Promise<T>) => await work(call),
    writes,
  };
};

const WINNER_AND_LOSER: MetaAd[] = [
  {
    clicks: 60,
    effective_status: "ACTIVE",
    id: "ad1",
    impressions: 2000,
    spend: "30",
  },
  {
    clicks: 5,
    effective_status: "ACTIVE",
    id: "ad2",
    impressions: 2000,
    spend: "10",
  },
];

const setup = async ({
  flag = true,
  review = { approve: true, reason: "Enough data; clear loser." },
}: {
  flag?: boolean;
  review?: unknown;
} = {}) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {} as never,
      score: 80,
      seed: "cats",
      theme: "Cats",
      userId: USER_ID,
    })
    .returning();
  const [drawn] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: "https://example.com/a.png",
      artworkWidth: 10,
      brief: {} as never,
      ideaId: found?.id ?? "",
      judgment: {} as never,
      userId: USER_ID,
    })
    .returning();
  const [made] = await db
    .insert(product)
    .values({
      catalogProductId: "cp",
      customizationId: "cu",
      designId: drawn?.id ?? "",
      mediaUri: "m",
      mockups: [],
      offerId: "o",
      price: 25,
      userId: USER_ID,
    })
    .returning();
  const [staged] = await db
    .insert(campaign)
    .values({
      adAccountId: "act1",
      adIds: ["ad1", "ad2"],
      adSetId: "set1",
      copy: [],
      creativeIds: [],
      dailyBudgetCents: 1000,
      metaCampaignId: "mc1",
      pageId: "p",
      productId: made?.id ?? "",
      userId: USER_ID,
    })
    .returning();
  const sent: WovainEvent[] = [];
  const reviewer = fakeNemotron(review);
  const actor = {
    core: {
      flags: { isOn: async () => await Promise.resolve(flag) },
      models: { modelFor: () => REASONING_MODEL },
      nemotron: reviewer.ask,
    },
    db: db as unknown as Database,
    events: {
      send: async (event: WovainEvent) => {
        sent.push(event);
        return await Promise.resolve();
      },
    },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, campaignId: staged?.id ?? "", db, reviewer, sent };
};

const deps = (meta: ReturnType<typeof fakeMeta>) => ({
  meta: meta.meta,
  now: () => NOW,
  rng: seededRng(11),
});

describe("the ads optimizer flow", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it("does nothing with the flag off", async () => {
    const off = await setup({ flag: false });
    const meta = fakeMeta(WINNER_AND_LOSER);
    expect(await optimizeMerchant(off.actor, {}, deps(meta))).toBe("flag_off");
    expect(await off.db.select().from(adOptimizerState)).toEqual([]);
  });

  it("queues a pause for the merchant at level suggest, and traces why", async () => {
    const meta = fakeMeta(WINNER_AND_LOSER);
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    expect(outcome).toMatchObject({ outcome: "enqueued", status: "pending" });
    expect(meta.writes).toEqual([]);

    const states = await ctx.db.select().from(adOptimizerState);
    const loser = states.find((row) => row.metaAdId === "ad2");
    expect(loser).toMatchObject({ alpha: 6, beta: 1996, clicks: 5 });
    expect(loser?.weight).toBeLessThan(0.05);

    const [queued] = await ctx.db.select().from(approval);
    expect(queued).toMatchObject({
      actionType: "media.ad.pause",
      policyReason: "above_level",
      proposedBy: "optimizer",
    });
    const steps = await ctx.db.select().from(decisionTrace);
    expect(steps.map((step) => step.step)).toEqual([
      "meta.read",
      "assess",
      "review",
      "policy",
    ]);
    expect(steps.find((step) => step.step === "review")?.model).toBe(
      REASONING_MODEL
    );
    expect(steps.every((step) => step.approvalId === queued?.id)).toBe(true);
    expect(ctx.sent.map((event) => event.name)).toEqual([
      "wovain/approval.requested",
    ]);
  });

  it("runs a pause at once within level draft, then holds for learning", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "draft",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const meta = fakeMeta(WINNER_AND_LOSER);
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    expect(outcome).toMatchObject({ outcome: "enqueued", status: "approved" });
    const decided = ctx.sent.find(
      (event) => event.name === "wovain/approval.decided"
    );
    expect(decided?.data).toMatchObject({
      decidedBy: "policy",
      status: "approved",
    });

    // The executor, as the approval.decided event would run it.
    const approvalId =
      outcome?.outcome === "enqueued" ? outcome.approvalId : "";
    expect(
      await executeOptimizerApproval(ctx.actor, approvalId, deps(meta))
    ).toBe("done");
    expect(meta.writes).toEqual([
      {
        args: expect.objectContaining({
          entity_id: "ad2",
          entity_type: "ad",
          fields: JSON.stringify({ status: "PAUSED" }),
        }),
        tool: "ads_update_entity",
      },
    ]);
    const [done] = await ctx.db.select().from(approval);
    expect(done?.status).toBe("done");
    const events = await ctx.db.select().from(auditEvent);
    expect(events.map((row) => row.event)).toContain("done");
    // A duplicate event is a no-op.
    expect(
      await executeOptimizerApproval(ctx.actor, approvalId, deps(meta))
    ).toBe("skipped");

    // The edit restarts learning: the next run proposes nothing.
    const [next] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(fakeMeta(WINNER_AND_LOSER))
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    expect(next).toMatchObject({ hold: "learning_phase", outcome: "held" });
  });

  it("drops a proposal the reviewer vetoes", async () => {
    const vetoing = await setup({
      review: { approve: false, reason: "Clicks are not sales." },
    });
    const meta = fakeMeta(WINNER_AND_LOSER);
    const [outcome] = (await optimizeMerchant(
      vetoing.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    expect(outcome).toEqual({
      campaignId: vetoing.campaignId,
      outcome: "vetoed",
      reason: "Clicks are not sales.",
    });
    expect(await vetoing.db.select().from(approval)).toEqual([]);
  });

  it("holds a campaign the merchant hasn't started", async () => {
    const meta = fakeMeta(WINNER_AND_LOSER, "PAUSED");
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    expect(outcome).toMatchObject({ hold: "campaign_not_live" });
    expect(ctx.reviewer.asked).toEqual([]);
  });

  it("denies a budget raise past the monthly cap", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 5000,
      level: "publish_ads_paused",
      monthlySpendCapCents: 100,
      paused: false,
    });
    const strong: MetaAd[] = [
      {
        ...WINNER_AND_LOSER[0],
        clicks: 100,
        id: "ad1",
        impressions: 3000,
      } as MetaAd,
      {
        clicks: 100,
        effective_status: "ACTIVE",
        id: "ad2",
        impressions: 3000,
        spend: "29",
      },
    ];
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(fakeMeta(strong))
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    expect(outcome).toMatchObject({ outcome: "enqueued", status: "denied" });
    const [denied] = await ctx.db.select().from(approval);
    expect(denied).toMatchObject({
      actionType: "media.budget.change",
      policyReason: "over_monthly_cap",
    });
  });

  it("proposes nothing new while an optimizer approval is outstanding", async () => {
    const first = await optimizeMerchant(
      ctx.actor,
      {},
      deps(fakeMeta(WINNER_AND_LOSER))
    );
    expect(first).toMatchObject([{ outcome: "enqueued", status: "pending" }]);
    const [queued] = await ctx.db.select().from(approval);
    expect(queued?.expiresAt).toEqual(new Date(NOW.getTime() + DAY_MS));

    // Half a day later the first still waits, so nothing new is proposed.
    // Two days later it has lapsed, and the optimizer proposes again.
    const nextDay = await optimizeMerchant(
      ctx.actor,
      {},
      {
        ...deps(fakeMeta(WINNER_AND_LOSER)),
        now: () => new Date(NOW.getTime() + DAY_MS / 2),
      }
    );
    expect(nextDay).toMatchObject([
      { hold: "approval_outstanding", outcome: "held" },
    ]);
    expect(await ctx.db.select().from(approval)).toHaveLength(1);

    const later = await optimizeMerchant(
      ctx.actor,
      {},
      {
        ...deps(fakeMeta(WINNER_AND_LOSER)),
        now: () => new Date(NOW.getTime() + 2 * DAY_MS),
      }
    );
    expect(later).toMatchObject([{ outcome: "enqueued", status: "pending" }]);
  });

  it("runs only the first of two approvals on one campaign", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "draft",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const meta = fakeMeta(WINNER_AND_LOSER);
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    const firstId = outcome?.outcome === "enqueued" ? outcome.approvalId : "";
    // A second approval for the same campaign, as an older queue could hold.
    const { approval: second } = await approvalsFor(ctx.actor).enqueue(
      {
        idempotencyKey: "optimizer:stacked",
        payload: {
          adAccountId: "act1",
          adId: "ad2",
          campaignId: ctx.campaignId,
        },
        proposedBy: "optimizer",
        title: "Pause a weak ad",
        type: "media.ad.pause",
        userId: USER_ID,
      },
      await autonomyOf(ctx.actor)
    );
    expect(second.status).toBe("approved");

    expect(await executeOptimizerApproval(ctx.actor, firstId, deps(meta))).toBe(
      "done"
    );
    // The first edit restarted learning: the second is not run.
    expect(
      await executeOptimizerApproval(ctx.actor, second.id, deps(meta))
    ).toBe("stale");
    expect(meta.writes).toHaveLength(1);
    const [stale] = await ctx.db
      .select()
      .from(approval)
      .where(eq(approval.id, second.id));
    expect(stale?.status).toBe("failed");
    expect(stale?.error).toContain("stale");
  });

  it("doesn't apply a budget change made stale by a moved budget or the cap", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 1100,
      level: "suggest",
      monthlySpendCapCents: 100_000,
      paused: false,
    });
    const approvals = approvalsFor(ctx.actor);
    const settings = await autonomyOf(ctx.actor);
    const approveBudget = async (fromCents: number, toCents: number) => {
      const { approval: queued } = await approvals.enqueue(
        {
          idempotencyKey: `optimizer:budget:${fromCents}:${toCents}`,
          payload: {
            adAccountId: "act1",
            campaignId: ctx.campaignId,
            fromCents,
            metaCampaignId: "mc1",
            toCents,
          },
          proposedBy: "optimizer",
          spendCents: Math.max(0, toCents - fromCents),
          title: "Change the daily budget",
          type: "media.budget.change",
          userId: USER_ID,
        },
        settings
      );
      await approvals.decide(
        {
          approvalId: queued.id,
          approve: true,
          decidedBy: USER_ID,
          userId: USER_ID,
        },
        settings
      );
      return queued.id;
    };
    const meta = fakeMeta(WINNER_AND_LOSER);
    // Proposed on $8; Meta now says $10.
    const moved = await approveBudget(800, 640);
    expect(await executeOptimizerApproval(ctx.actor, moved, deps(meta))).toBe(
      "stale"
    );
    // $12 is past the $11 daily cap.
    const pastCap = await approveBudget(1000, 1200);
    expect(await executeOptimizerApproval(ctx.actor, pastCap, deps(meta))).toBe(
      "stale"
    );
    expect(meta.writes).toEqual([]);
    // A cut on the current budget runs.
    const cut = await approveBudget(1000, 800);
    expect(await executeOptimizerApproval(ctx.actor, cut, deps(meta))).toBe(
      "done"
    );
    const [saved] = await ctx.db.select().from(campaign);
    expect(saved?.dailyBudgetCents).toBe(800);
  });

  it("keeps a written action out of failed when the bookkeeping fails", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "draft",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const meta = fakeMeta(WINNER_AND_LOSER);
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    const approvalId =
      outcome?.outcome === "enqueued" ? outcome.approvalId : "";
    const write = await writeOptimizerApproval(
      ctx.actor,
      approvalId,
      deps(meta)
    );
    expect(write.kind).toBe("written");
    if (write.kind !== "written") {
      return;
    }
    const brokenDb = new Proxy(ctx.actor.db, {
      get: (target, key) =>
        key === "update"
          ? () => {
              throw new Error("database down");
            }
          : Reflect.get(target, key),
    });
    await expect(
      finishOptimizerApproval({ ...ctx.actor, db: brokenDb }, approvalId, write)
    ).rejects.toThrow("database down");
    const [waiting] = await ctx.db.select().from(approval);
    expect(waiting?.status).toBe("executing");

    // The Inngest retry redoes only the bookkeeping.
    await finishOptimizerApproval(ctx.actor, approvalId, write);
    const [done] = await ctx.db.select().from(approval);
    expect(done?.status).toBe("done");
    expect(meta.writes).toHaveLength(1);
    const states = await ctx.db.select().from(adOptimizerState);
    expect(states.every((row) => "lastEditAt" in row.params)).toBe(true);
  });

  it("logs and records a failed Meta write", async () => {
    await setAutonomy(ctx.actor, {
      dailySpendCapCents: 0,
      level: "draft",
      monthlySpendCapCents: 0,
      paused: false,
    });
    const meta = fakeMeta(WINNER_AND_LOSER);
    const [outcome] = (await optimizeMerchant(
      ctx.actor,
      {},
      deps(meta)
    )) as Exclude<Awaited<ReturnType<typeof optimizeMerchant>>, "flag_off">;
    const approvalId =
      outcome?.outcome === "enqueued" ? outcome.approvalId : "";
    const broken = {
      meta: async () => await Promise.reject(new Error("Meta said no")),
      now: () => NOW,
    };
    expect(await executeOptimizerApproval(ctx.actor, approvalId, broken)).toBe(
      "failed"
    );
    const [failed] = await ctx.db.select().from(approval);
    expect(failed).toMatchObject({ error: "Meta said no", status: "failed" });
  });
});
