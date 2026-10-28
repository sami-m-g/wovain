import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { InMemoryStore } from "@mastra/core/storage";
import type { Core } from "@wovain/core/core";
import { SCORE_WEIGHTS } from "@wovain/core/score";
import { createMerchantMemory } from "@wovain/core/taste";
import type { ProviderId, ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { decisionTrace, performanceSnapshot } from "@wovain/db/schema/autonomy";
import {
  campaign,
  connection,
  design,
  idea,
  product,
  run,
} from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { log } from "evlog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import {
  LEARN_COOLDOWN_MS,
  learnFromResults,
  learnOnDemand,
  OUTCOME_DAYS,
  researchFeedbackOf,
  SNAPSHOT_DAYS,
  snapshotPerformance,
  whatWeLearned,
} from "./feedback";

// The feedback loop on real Postgres (PGlite, with the app's migrations):
// Fourthwall and Meta answer from fakes, one day at a time.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const NOW = new Date("2026-10-28T12:00:00.000Z");
const LIVE_SINCE = new Date("2026-10-10T00:00:00.000Z");
// 10-10 to 10-28: the first snapshot reads back to the oldest product.
const BACKFILL_DAYS = 19;

// Three ideas: the fresher the news, the more it sold each day.
const IDEAS = [
  { recency: 0.1, theme: "Moth tees", title: "Moth Tee", units: 0 },
  { recency: 0.5, theme: "Cottagecore frogs", title: "Frog Tee", units: 1 },
  { recency: 0.9, theme: "Retro slasher VHS", title: "VHS Tee", units: 3 },
];

const signals = (recency: number) => ({
  affinity: 0.5,
  ipSafety: 1,
  margin: 0.5,
  marketHits: 5,
  newsHits: 2,
  recency,
  relevance: 0.6,
});

type Db = ReturnType<typeof drizzle<typeof relations>>;

// One idea with its run, approved design and public product.
const seedIdea = async (
  db: Db,
  item: (typeof IDEAS)[number],
  index: number
) => {
  const [started] = await db
    .insert(run)
    .values({ seed: "spooky", status: "completed", userId: USER_ID })
    .returning();
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {
        rank: 1,
        references: [],
        score: 0.5,
        signals: signals(item.recency),
        sources: [],
        theme: item.theme,
      },
      runId: started?.id ?? null,
      score: 0.5,
      seed: "spooky",
      theme: item.theme,
      userId: USER_ID,
    })
    .returning();
  const [drafted] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: "https://v3.fal.media/a.png",
      artworkWidth: 10,
      brief: {
        artPrompt: "art",
        description: "d",
        garmentColors: ["black"],
        printedText: [],
        title: item.title,
      },
      ideaId: found?.id ?? "",
      judgment: {
        checks: [],
        coach: "Good",
        fixes: [],
        score: 90,
        verdict: "ready",
      },
      runId: started?.id ?? null,
      status: "approved",
      userId: USER_ID,
    })
    .returning();
  const [live] = await db
    .insert(product)
    .values({
      catalogProductId: "prd_tee",
      createdAt: LIVE_SINCE,
      customizationId: `cus_${index}`,
      designId: drafted?.id ?? "",
      mediaUri: "https://cdn.fourthwall.com/m.png",
      mockups: [],
      offerId: `off_${index}`,
      price: 24,
      status: "public",
      userId: USER_ID,
    })
    .returning();
  return live?.id ?? "";
};

const seed = async (db: Db) => {
  const products = await Promise.all(
    IDEAS.map(async (item, index) => await seedIdea(db, item, index))
  );
  await db.insert(campaign).values({
    adAccountId: "act_1",
    adIds: ["ad_1"],
    adSetId: "as_1",
    copy: {} as never,
    creativeIds: [],
    dailyBudgetCents: 500,
    metaCampaignId: "cmp_1",
    pageId: "page_1",
    productId: products[2] ?? "",
    userId: USER_ID,
  });
  await db.insert(connection).values([
    { provider: "fourthwall", sealedTokens: "sealed", userId: USER_ID },
    { provider: "meta", sealedTokens: "sealed", userId: USER_ID },
  ]);
};

// Sales for each idea, the same every day.
const fourthwall: ToolCall = (tool) =>
  Promise.resolve(
    tool === "ecommerce_get-top-products-by-units-sold-report"
      ? {
          rows: IDEAS.filter((item) => item.units > 0).map((item) => ({
            gross_sales: item.units * 24,
            orders: item.units,
            product: item.title,
            units_sold: item.units,
          })),
        }
      : { rows: [] }
  );

const meta: ToolCall = (_tool, args) =>
  Promise.resolve({
    ad_entities: [
      {
        amount_spent: "5",
        clicks: 9,
        ctr: 1.8,
        id: args.level === "ad" ? "ad_1" : "cmp_1",
        impressions: 500,
        name: "VHS",
        results: 9,
      },
    ],
  });

const salesReads = (call: ReturnType<typeof vi.fn>) =>
  call.mock.calls.filter(
    ([tool]) => tool === "ecommerce_get-top-products-by-units-sold-report"
  ).length;

const setup = async (providers: Partial<Record<ProviderId, ToolCall>>) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  await seed(db);
  const memory = createMerchantMemory(new InMemoryStore());
  const core = {
    flags: { isOn: () => Promise.resolve(true) },
    memory,
    upstream: {
      session: async (
        provider: ProviderId,
        _grant: unknown,
        _log: unknown,
        work: (call: ToolCall) => Promise<unknown>
      ) => {
        const call = providers[provider];
        if (call === undefined) {
          throw new Error(`${provider} is down`);
        }
        return await work(call);
      },
    },
  } as unknown as Core;
  const actor = {
    core,
    db: db as unknown as Database,
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, memory };
};

describe("feedback loop on Postgres", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup({ fourthwall, meta });
  });

  it("backfills on the first snapshot, then reads the last days, once per entity", async () => {
    const shop = vi.fn(fourthwall);
    const reads = await setup({ fourthwall: shop, meta });

    await snapshotPerformance(reads.actor, NOW);
    expect(salesReads(shop)).toBe(BACKFILL_DAYS);
    shop.mockClear();
    const result = await snapshotPerformance(reads.actor, NOW);
    expect(salesReads(shop)).toBe(SNAPSHOT_DAYS);

    expect(result.failed).toEqual([]);
    const rows = await reads.db.select().from(performanceSnapshot);
    // Per day: 3 products, 3 drops, 1 campaign, 1 ad.
    expect(rows).toHaveLength(BACKFILL_DAYS * 8);
    const vhs = rows.filter(
      (row) => row.level === "product" && row.entityId === "off_2"
    );
    expect(vhs).toHaveLength(BACKFILL_DAYS);
    expect(vhs.every((row) => row.units === 3)).toBe(true);
    expect(vhs[0]?.revenueCents).toBe(7200);
    const campaignDay = rows.find(
      (row) => row.level === "campaign" && row.date === "2026-10-28"
    );
    expect(campaignDay).toMatchObject({
      clicks: 9,
      impressions: 500,
      source: "meta",
      spendCents: 500,
    });
    const drop = rows.find(
      (row) =>
        row.level === "drop" && row.units === 3 && row.date === "2026-10-28"
    );
    expect(drop?.raw).toEqual({ published: 1, sold: 1 });
  });

  it("backfills at most the outcome window", async () => {
    const shop = vi.fn(fourthwall);
    const reads = await setup({ fourthwall: shop, meta });
    await reads.db
      .update(product)
      .set({ createdAt: new Date("2026-06-01T00:00:00.000Z") });

    await snapshotPerformance(reads.actor, NOW);

    expect(salesReads(shop)).toBe(OUTCOME_DAYS);
  });

  it("learns: re-fits the weights, traces the fit and writes taste memory", async () => {
    expect(await researchFeedbackOf(ctx.actor)).toBeUndefined();

    const { record } = await learnFromResults(ctx.actor, NOW);

    expect(record.samples).toBe(3);
    expect(record.version).toBe(1);
    expect(record.weights.recency).toBeGreaterThan(SCORE_WEIGHTS.recency);
    // Every day since launch: 3 a day for 19 days, at $24.
    expect(record.learned.sold[0]).toEqual({
      ctr: 0.018,
      ideaId: expect.any(String),
      revenueCents: 3 * BACKFILL_DAYS * 2400,
      theme: "Retro slasher VHS",
      units: 3 * BACKFILL_DAYS,
    });
    expect(record.learned.unsold.map((item) => item.theme)).toEqual([
      "Moth tees",
    ]);

    const traces = await ctx.db
      .select()
      .from(decisionTrace)
      .where(
        and(
          eq(decisionTrace.userId, USER_ID),
          eq(decisionTrace.agent, "feedback_loop")
        )
      );
    expect(traces.map((row) => row.step).toSorted()).toEqual([
      "score_weights",
      "snapshot",
    ]);

    const memory = await ctx.memory.getWorkingMemory({
      resourceId: USER_ID,
      threadId: `taste:${USER_ID}`,
    });
    expect(memory).toContain(
      "Retro slasher VHS: 57 sold, $1,368.00 revenue, CTR 1.8%"
    );
    expect(memory).toContain("Moth tees: no sales");

    const feedback = await researchFeedbackOf(ctx.actor);
    expect(feedback?.weights).toEqual(record.weights);
    expect(feedback?.learned).toEqual({
      sold: [
        "Retro slasher VHS: 57 sold, $1,368.00 revenue, CTR 1.8%",
        "Cottagecore frogs: 19 sold, $456.00 revenue",
      ],
      unsold: ["Moth tees: no sales"],
    });

    // The same data again is the same version.
    const again = await learnFromResults(ctx.actor, NOW);
    expect(again.record.version).toBe(1);
    const shown = await whatWeLearned(ctx.actor);
    expect(shown.version).toBe(1);
    expect(shown.learned).toEqual(record.learned);
  });

  it("leaves out products launched before the snapshots cover them", async () => {
    // Moth tees went on sale long before the loop's first snapshot: its
    // early sales were never read, so it doesn't count as unsold.
    const [moth] = await ctx.db
      .select({ id: product.id })
      .from(product)
      .where(eq(product.offerId, "off_0"));
    await ctx.db
      .update(product)
      .set({ createdAt: new Date("2026-08-01T00:00:00.000Z") })
      .where(eq(product.id, moth?.id ?? ""));
    const later = new Date("2026-09-20T12:00:00.000Z");
    await snapshotPerformance(ctx.actor, later);

    const { record } = await learnFromResults(ctx.actor, NOW);

    expect(record.samples).toBe(2);
    expect(record.learned.unsold).toEqual([]);
  });

  it("measures each product over its first days for sale", async () => {
    // Snapshots from long after the VHS tee's window add nothing to it.
    await learnFromResults(ctx.actor, NOW);
    const late = new Date(
      LIVE_SINCE.getTime() + (OUTCOME_DAYS + 10) * 86_400_000
    );

    const { record } = await learnFromResults(ctx.actor, late);

    const vhs = record.learned.sold.find(
      (item) => item.theme === "Retro slasher VHS"
    );
    expect(vhs?.units).toBe(3 * BACKFILL_DAYS);
  });

  // PGlite runs one transaction at a time, so this checks the outcome; the
  // per-merchant advisory lock is what gives the same on a Postgres pool.
  it("gives two fits at once different turns, never the same new version", async () => {
    await Promise.all([
      learnFromResults(ctx.actor, NOW),
      learnFromResults(ctx.actor, NOW),
    ]);

    const fits = await ctx.db
      .select({ output: decisionTrace.output })
      .from(decisionTrace)
      .where(eq(decisionTrace.step, "score_weights"));
    const outputs = fits.map(
      (row) => row.output as { changed: boolean; version: number }
    );
    expect(outputs).toHaveLength(2);
    expect(outputs.filter((item) => item.changed)).toHaveLength(1);
    expect(outputs.map((item) => item.version)).toEqual([1, 1]);
  });

  it("reuses a fresh fit when asked again within the cooldown", async () => {
    const shop = vi.fn(fourthwall);
    const reads = await setup({ fourthwall: shop, meta });

    await learnOnDemand(reads.actor, NOW);
    shop.mockClear();
    const soon = new Date(NOW.getTime() + LEARN_COOLDOWN_MS - 1000);
    const shown = await learnOnDemand(reads.actor, soon);

    expect(salesReads(shop)).toBe(0);
    expect(shown.version).toBe(1);

    const after = new Date(NOW.getTime() + LEARN_COOLDOWN_MS);
    await learnOnDemand(reads.actor, after);
    expect(salesReads(shop)).toBe(SNAPSHOT_DAYS);
  });

  it("keeps Fourthwall's rows when Meta fails, and logs the failure", async () => {
    const down = await setup({ fourthwall });
    const error = vi.spyOn(log, "error").mockImplementation(() => {});

    const result = await snapshotPerformance(down.actor, NOW);

    expect(result.failed).toEqual(["meta"]);
    expect(result.saved.fourthwall).toBe(BACKFILL_DAYS * 6);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "FEEDBACK_SNAPSHOT_FAILED" }),
      })
    );
    error.mockRestore();
  });
});
