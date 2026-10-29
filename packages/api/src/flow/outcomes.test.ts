import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { adRuleSettingsOf } from "@wovain/core/ad-rules";
import type { Core } from "@wovain/core/core";
import type { MetaCampaignRead } from "@wovain/core/optimizer-meta";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import {
  designOutcome,
  drop,
  dropItem,
  performanceSnapshot,
} from "@wovain/db/schema/autonomy";
import { campaign, design, idea, product, run } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import type { Actor } from "./actor";
import {
  globalPriorOf,
  killEconomicsOf,
  outcomeModelFor,
  recordAdOutcomes,
  refreshOutcomes,
  testFloorSharesOf,
} from "./outcomes";

// Outcomes per design on real Postgres (PGlite, with the app's migrations).

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const NOW = new Date("2026-10-29T12:00:00.000Z");
const LAUNCHED = new Date("2026-10-15T00:00:00.000Z");

type Db = ReturnType<typeof drizzle<typeof relations>>;

const signals = {
  affinity: 0.5,
  ipSafety: 1,
  margin: 0.5,
  marketHits: 5,
  newsHits: 2,
  recency: 0.5,
  relevance: 0.6,
};

// One idea, its approved design and a public product at $30.
const seedDesign = async (
  db: Db,
  {
    index,
    tag,
    userId = USER_ID,
  }: { index: number; tag: string; userId?: string }
) => {
  const [started] = await db
    .insert(run)
    .values({ seed: tag, status: "completed", userId })
    .returning();
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {
        qlooTag: tag,
        rank: 1,
        references: [],
        score: 0.5,
        signals,
        sources: [],
        taste: {
          affinities: [],
          seeds: [
            { id: "q1", name: "Studio Ghibli", type: "urn:entity:movie" },
          ],
        },
        theme: `${tag} tees`,
      },
      runId: started?.id ?? null,
      score: 0.5,
      seed: tag,
      style: {
        blank: "tee",
        palette: { adjusted: [], garments: [], inks: [], label: "Moss" },
        palettes: [],
        tones: [],
      },
      theme: `${tag} tees`,
      userId,
      whoBuys: {
        audiences: [{ affinity: 0.9, id: "a1", name: "Book lovers" }],
        brands: [],
        buyers: {} as never,
        location: "US",
        places: [],
      },
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
        title: `${tag} ${index}`,
      },
      ideaId: found?.id ?? "",
      judgment: {
        checks: [],
        coach: "",
        fixes: [],
        score: 90,
        verdict: "ready",
      },
      runId: started?.id ?? null,
      status: "approved",
      userId,
    })
    .returning();
  const [live] = await db
    .insert(product)
    .values({
      catalogProductId: "prd_tee",
      createdAt: LAUNCHED,
      customizationId: `cus_${userId}_${index}`,
      designId: drafted?.id ?? "",
      mediaUri: "https://cdn.fourthwall.com/m.png",
      mockups: [],
      offerId: `off_${userId}_${index}`,
      price: 30,
      status: "public",
      userId,
    })
    .returning();
  return live?.id ?? "";
};

const sale = (productId: string, date: string, units: number) => ({
  date,
  entityId: productId,
  level: "product" as const,
  productId,
  revenueCents: units * 3000,
  source: "fourthwall" as const,
  units,
  userId: USER_ID,
});

const read = (
  ads: { adId: string; purchases: number; spendCents: number }[]
): MetaCampaignRead => ({
  ads: ads.map((ad) => ({
    active: true,
    addToCarts: ad.purchases + 1,
    clicks: 50,
    impressions: 2000,
    ...ad,
  })),
  live: true,
  resultsLast7d: 0,
  spendMonthCents: 0,
  spendTodayCents: 0,
});

const setup = async (flagOn = true) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values([
    { email: "m@example.com", emailVerified: true, id: USER_ID, name: "M" },
    { email: "o@example.com", emailVerified: true, id: "user_2", name: "O" },
  ]);
  const core = {
    flags: { isOn: () => Promise.resolve(flagOn) },
  } as unknown as Core;
  const actor = {
    core,
    db: db as unknown as Database,
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db };
};

describe("outcomes per design on Postgres", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let products: string[];

  beforeEach(async () => {
    ctx = await setup();
    products = [
      await seedDesign(ctx.db, { index: 0, tag: "cottagecore" }),
      await seedDesign(ctx.db, { index: 1, tag: "cottagecore" }),
      await seedDesign(ctx.db, { index: 2, tag: "gothic" }),
    ];
    const [made] = await ctx.db
      .insert(drop)
      .values({ name: "Frogs", qlooTags: ["Frogcore"], userId: USER_ID })
      .returning();
    await ctx.db.insert(dropItem).values({
      catalogProductId: "prd_tee",
      dropId: made?.id ?? "",
      productId: products[0] ?? "",
      userId: USER_ID,
    });
  });

  it("records each design's angles and sales, once per product however often it runs", async () => {
    await ctx.db
      .insert(performanceSnapshot)
      .values([
        sale(products[0] ?? "", "2026-10-15", 2),
        sale(products[0] ?? "", "2026-10-16", 1),
      ]);
    await refreshOutcomes(ctx.actor, { now: NOW });
    await refreshOutcomes(ctx.actor, { now: NOW });

    const rows = await ctx.db.select().from(designOutcome);
    expect(rows).toHaveLength(3);
    const first = rows.find((row) => row.productId === products[0]);
    expect(first).toMatchObject({
      audience: "Book lovers",
      blank: "prd_tee",
      palette: "Moss",
      priceCents: 3000,
      qlooEntities: ["Studio Ghibli"],
      qlooTags: ["cottagecore", "Frogcore"],
      revenueCents: 9000,
      salesCovered: true,
      theme: "cottagecore tees",
      units: 3,
    });
    expect(first?.dropId).not.toBeNull();
    expect(first?.profitPerSaleCents).toBeGreaterThan(0);
  });

  it("records Meta's numbers per design from the tick and keeps them on the daily refresh", async () => {
    const [row] = await ctx.db
      .insert(campaign)
      .values({
        adAccountId: "act_1",
        adIds: ["ad_a", "ad_b", "ad_c"],
        adSetId: "as_1",
        copy: [],
        creativeIds: [],
        dailyBudgetCents: 1500,
        designs: [
          {
            adIds: ["ad_a", "ad_b"],
            adSetId: "as_1",
            copy: [],
            creativeIds: [],
            productId: products[0] ?? "",
          },
          {
            adIds: ["ad_c"],
            adSetId: "as_2",
            copy: [],
            creativeIds: [],
            productId: products[2] ?? "",
          },
        ],
        metaCampaignId: "cmp_1",
        pageId: "page_1",
        productId: products[0] ?? "",
        userId: USER_ID,
      })
      .returning();
    if (row === undefined) {
      throw new Error("no campaign");
    }
    await recordAdOutcomes(
      ctx.actor,
      new Map([
        [
          row.id,
          {
            read: read([
              { adId: "ad_a", purchases: 2, spendCents: 800 },
              { adId: "ad_b", purchases: 1, spendCents: 400 },
              { adId: "ad_c", purchases: 0, spendCents: 900 },
            ]),
            row,
          },
        ],
      ]),
      NOW
    );
    await refreshOutcomes(ctx.actor, { now: NOW });

    const rows = await ctx.db.select().from(designOutcome);
    const byProduct = new Map(rows.map((each) => [each.productId, each]));
    expect(byProduct.get(products[0] ?? "")).toMatchObject({
      addToCarts: 5,
      clicks: 100,
      impressions: 4000,
      purchases: 3,
      spendCents: 1200,
    });
    expect(byProduct.get(products[0] ?? "")?.metaReadAt).toEqual(NOW);
    expect(byProduct.get(products[2] ?? "")).toMatchObject({
      purchases: 0,
      spendCents: 900,
    });
    expect(byProduct.get(products[1] ?? "")?.metaReadAt).toBeNull();
  });

  it("favours the angle that sold in a test's floor, and explains it", async () => {
    await ctx.db
      .insert(performanceSnapshot)
      .values([
        sale(products[0] ?? "", "2026-10-15", 3),
        sale(products[1] ?? "", "2026-10-15", 2),
      ]);
    await refreshOutcomes(ctx.actor, { now: NOW });
    const model = await outcomeModelFor(ctx.actor, NOW);
    expect(model).toMatchObject({ designs: 3, wins: 2 });

    const [winner, , loser] = products;
    const shares = await testFloorSharesOf(ctx.actor, [
      winner ?? "",
      loser ?? "",
    ]);
    expect(
      (shares?.get(winner ?? "") ?? 0) > (shares?.get(loser ?? "") ?? 1)
    ).toBe(true);
  });

  it("gives the kill rules the real cost per sale once there are enough purchases", async () => {
    await refreshOutcomes(ctx.actor, { now: NOW });
    await ctx.db.update(designOutcome).set({ purchases: 12, spendCents: 2400 });
    const settings = adRuleSettingsOf({});
    const economics = await killEconomicsOf(
      ctx.actor,
      [products[0] ?? ""],
      settings
    );
    const unit = economics.get(products[0] ?? "");
    expect(unit?.realCostPerSaleCents).toBeGreaterThan(0);
    expect(unit?.realCostPerSaleCents).toBeLessThan(unit?.profitCents ?? 0);

    const off = await setup(false);
    const plain = await killEconomicsOf(off.actor, [], settings);
    expect(plain.size).toBe(0);
    const fewer = await killEconomicsOf(
      ctx.actor,
      [products[0] ?? ""],
      adRuleSettingsOf({ realCpaMinPurchases: 1000 })
    );
    expect(fewer.get(products[0] ?? "")?.realCostPerSaleCents).toBeUndefined();
  });

  it("pools only counts across merchants for the global prior", async () => {
    await seedDesign(ctx.db, { index: 9, tag: "western", userId: "user_2" });
    await refreshOutcomes(ctx.actor, { now: NOW });
    await refreshOutcomes({ db: ctx.actor.db, userId: "user_2" }, { now: NOW });
    expect(await globalPriorOf(ctx.actor, NOW)).toEqual({
      designs: 4,
      wins: 0,
    });
  });
});
