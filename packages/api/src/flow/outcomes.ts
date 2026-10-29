import type { AdResults, AdRuleSettings } from "@wovain/core/ad-rules";
import type { MetaCampaignRead } from "@wovain/core/optimizer-meta";
import { readCampaign } from "@wovain/core/optimizer-meta";
import {
  fitOutcomeModel,
  floorShares,
  MIN_LIVE_DAYS,
  outcomeScore,
  realCostPerSaleOf,
} from "@wovain/core/outcomes";
import type {
  DesignOutcome,
  GlobalPrior,
  OutcomeAttributes,
  OutcomeModel,
} from "@wovain/core/outcomes";
import {
  designOutcome,
  drop,
  dropItem,
  performanceSnapshot,
} from "@wovain/db/schema/autonomy";
import { campaign, design, idea, product } from "@wovain/db/schema/seller";
import { and, eq, inArray, min, sql } from "drizzle-orm";
import { log } from "evlog";

import type { Actor } from "./actor";
import { adResultsOf, economicsOf } from "./ad-rules";
import { withProvider } from "./connections";
import { flagContextOf } from "./flags";

// Outcomes per design (openspec feedback-loop): each published design's
// angles (theme, Qloo tags and entities, audience, palette, price, blank)
// against its lifetime Meta results and Fourthwall sales, one durable row per
// product. The optimizer tick records Meta's numbers as it reads each
// campaign; the daily loop records Fourthwall's and the angles. The merchant's
// model (@wovain/core/outcomes) is fit from these rows on read: per-angle
// Beta-Binomial posteriors that rank ideas, weight a test's spend floor and
// give the kill rules a real cost per sale.

type CampaignRow = typeof campaign.$inferSelect;
type OutcomeRow = typeof designOutcome.$inferInsert;

/** Meta's lifetime numbers for one design's ads. */
export interface MetaTotals {
  addToCarts: number;
  clicks: number;
  impressions: number;
  purchases: number;
  spendCents: number;
}

const CENTS = 100;
const DAY_MS = 86_400_000;
// Products that have been for sale: their outcome counts.
const SOLD_STATUSES = ["public", "paused", "retired"] as const;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Every error reaches PostHog Error Tracking; the caller goes on. */
export const logOutcomeFailure = (
  code: string,
  error: unknown,
  userId: string
) => {
  log.error({
    error: {
      code,
      message: reasonOf(error),
      name: "OutcomeError",
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
    outcomes: { user_id: userId },
  });
};

export const outcomesOn = async (actor: Actor) =>
  await actor.core.flags.isOn("feedback-loop", flagContextOf(actor));

interface DesignAttributes extends OutcomeAttributes {
  designId: string;
  dropId: string | null;
  ideaId: string;
  launchedAt: Date;
  priceCents: number;
  productId: string;
  theme: string;
}

const uniqueNames = (names: (string | undefined)[]) => [
  ...new Set(
    names.flatMap((name) => {
      const trimmed = name?.trim();
      return trimmed === undefined || trimmed === "" ? [] : [trimmed];
    })
  ),
];

/** The angles of the merchant's published designs (or of `productIds`). */
export const attributesOf = async (
  actor: Pick<Actor, "db" | "userId">,
  productIds?: readonly string[]
): Promise<DesignAttributes[]> => {
  if (productIds?.length === 0) {
    return [];
  }
  const [rows, drops] = await Promise.all([
    actor.db
      .select({
        blank: product.catalogProductId,
        designId: design.id,
        ideaId: idea.id,
        launchedAt: product.createdAt,
        price: product.price,
        productId: product.id,
        research: idea.research,
        style: idea.style,
        theme: idea.theme,
        whoBuys: idea.whoBuys,
      })
      .from(product)
      .innerJoin(design, eq(design.id, product.designId))
      .innerJoin(idea, eq(idea.id, design.ideaId))
      .where(
        and(
          eq(product.userId, actor.userId),
          inArray(product.status, [...SOLD_STATUSES]),
          productIds === undefined
            ? undefined
            : inArray(product.id, [...productIds])
        )
      ),
    actor.db
      .select({
        dropId: drop.id,
        productId: dropItem.productId,
        qlooTags: drop.qlooTags,
      })
      .from(dropItem)
      .innerJoin(drop, eq(drop.id, dropItem.dropId))
      .where(eq(dropItem.userId, actor.userId)),
  ]);
  const dropOf = new Map(
    drops.flatMap((row) =>
      row.productId === null ? [] : [[row.productId, row] as const]
    )
  );
  return rows.map((row) => {
    const inDrop = dropOf.get(row.productId);
    return {
      audience: row.whoBuys?.audiences[0]?.name ?? null,
      blank: row.blank,
      designId: row.designId,
      dropId: inDrop?.dropId ?? null,
      ideaId: row.ideaId,
      launchedAt: row.launchedAt,
      palette: row.style?.palette?.label ?? null,
      priceCents: Math.round(row.price * CENTS),
      productId: row.productId,
      qlooEntities: uniqueNames(
        (row.research.taste?.seeds ?? []).map((seed) => seed.name)
      ),
      qlooTags: uniqueNames([
        row.research.qlooTag,
        row.research.taste?.tag?.name,
        ...(inDrop?.qlooTags ?? []),
      ]),
      theme: row.theme,
    };
  });
};

// Fourthwall's units and revenue per product, over every snapshot, and the
// first day the snapshots cover.
const salesOf = async (actor: Pick<Actor, "db" | "userId">) => {
  const mine = and(
    eq(performanceSnapshot.userId, actor.userId),
    eq(performanceSnapshot.source, "fourthwall")
  );
  const [rows, [covered]] = await Promise.all([
    actor.db
      .select({
        productId: performanceSnapshot.productId,
        revenueCents: sql<number>`coalesce(sum(${performanceSnapshot.revenueCents}), 0)::int`,
        units: sql<number>`coalesce(sum(${performanceSnapshot.units}), 0)::int`,
      })
      .from(performanceSnapshot)
      .where(and(mine, eq(performanceSnapshot.level, "product")))
      .groupBy(performanceSnapshot.productId),
    actor.db
      .select({ from: min(performanceSnapshot.date) })
      .from(performanceSnapshot)
      .where(mine),
  ]);
  return {
    byProduct: new Map(
      rows.flatMap(({ productId, revenueCents, units }) =>
        productId === null
          ? []
          : [
              [
                productId,
                { revenueCents: Number(revenueCents), units: Number(units) },
              ] as const,
            ]
      )
    ),
    from: covered?.from ?? undefined,
  };
};

const UPDATED = [
  "add_to_carts",
  "audience",
  "blank",
  "clicks",
  "design_id",
  "drop_id",
  "idea_id",
  "impressions",
  "launched_at",
  "meta_read_at",
  "palette",
  "price_cents",
  "profit_per_sale_cents",
  "purchases",
  "qloo_entities",
  "qloo_tags",
  "revenue_cents",
  "sales_covered",
  "spend_cents",
  "theme",
  "units",
] as const;

// Meta's columns: this tick's read, else the last one saved.
const metaColumns = (
  read: MetaTotals | undefined,
  last: typeof designOutcome.$inferSelect | undefined,
  now: Date
) => {
  if (read !== undefined) {
    return { ...read, metaReadAt: now };
  }
  return {
    addToCarts: last?.addToCarts ?? 0,
    clicks: last?.clicks ?? 0,
    impressions: last?.impressions ?? 0,
    metaReadAt: last?.metaReadAt ?? null,
    purchases: last?.purchases ?? 0,
    spendCents: last?.spendCents ?? 0,
  };
};

/**
 * Records every published design's outcome: its angles and Fourthwall's
 * sales, and Meta's lifetime numbers for the designs in `meta` (the others
 * keep their last ones). One row per product, upserted: a rerun overwrites.
 */
export const refreshOutcomes = async (
  actor: Pick<Actor, "db" | "userId">,
  {
    meta = new Map(),
    now = new Date(),
  }: { meta?: ReadonlyMap<string, MetaTotals>; now?: Date } = {}
) => {
  const designs = await attributesOf(actor);
  if (designs.length === 0) {
    return 0;
  }
  const [sales, economics, saved] = await Promise.all([
    salesOf(actor),
    economicsOf(
      actor,
      designs.map((item) => item.productId)
    ),
    actor.db
      .select()
      .from(designOutcome)
      .where(eq(designOutcome.userId, actor.userId)),
  ]);
  const before = new Map(saved.map((row) => [row.productId, row]));
  const rows: OutcomeRow[] = designs.map((item) => {
    const sold = sales.byProduct.get(item.productId);
    return {
      ...metaColumns(meta.get(item.productId), before.get(item.productId), now),
      audience: item.audience ?? null,
      blank: item.blank ?? "",
      designId: item.designId,
      dropId: item.dropId,
      ideaId: item.ideaId,
      launchedAt: item.launchedAt,
      palette: item.palette ?? null,
      priceCents: item.priceCents,
      productId: item.productId,
      profitPerSaleCents: economics.get(item.productId)?.profitCents ?? 0,
      qlooEntities: [...(item.qlooEntities ?? [])],
      qlooTags: [...(item.qlooTags ?? [])],
      revenueCents: sold?.revenueCents ?? 0,
      // Sales read from launch day on: a product older than the snapshots
      // falls back to Meta's purchases.
      salesCovered:
        sales.from !== undefined && sales.from <= isoDay(item.launchedAt),
      theme: item.theme,
      units: sold?.units ?? 0,
      userId: actor.userId,
    };
  });
  await actor.db
    .insert(designOutcome)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        ...Object.fromEntries(
          UPDATED.map((column) => [column, sql.raw(`excluded.${column}`)])
        ),
        updatedAt: now,
      },
      target: [designOutcome.userId, designOutcome.productId],
    });
  return rows.length;
};

const sum = (ads: readonly AdResults[], pick: (ad: AdResults) => number) =>
  ads.reduce((total, ad) => total + pick(ad), 0);

/** Each design's lifetime Meta totals from the campaigns read this tick. */
export const metaTotalsOf = (
  reads: ReadonlyMap<string, { read: MetaCampaignRead; row: CampaignRow }>
) => {
  const totals = new Map<string, MetaTotals>();
  for (const { read, row } of reads.values()) {
    const byId = new Map(adResultsOf(read.ads).map((ad) => [ad.adId, ad]));
    const designs = row.designs ?? [
      { adIds: row.adIds, productId: row.productId },
    ];
    for (const { adIds, productId } of designs) {
      const ads = adIds.flatMap((adId) => {
        const ad = byId.get(adId);
        return ad === undefined ? [] : [ad];
      });
      const was = totals.get(productId);
      totals.set(productId, {
        addToCarts: (was?.addToCarts ?? 0) + sum(ads, (ad) => ad.addToCarts),
        clicks: (was?.clicks ?? 0) + sum(ads, (ad) => ad.clicks),
        impressions: (was?.impressions ?? 0) + sum(ads, (ad) => ad.impressions),
        purchases: (was?.purchases ?? 0) + sum(ads, (ad) => ad.purchases),
        spendCents: (was?.spendCents ?? 0) + sum(ads, (ad) => ad.spendCents),
      });
    }
  }
  return totals;
};

/**
 * The optimizer tick's part: Meta's lifetime numbers per design, recorded
 * while the feedback-loop flag is on. A failure is logged at error level and
 * never stops the tick.
 */
export const recordAdOutcomes = async (
  actor: Actor,
  reads: ReadonlyMap<string, { read: MetaCampaignRead; row: CampaignRow }>,
  now = new Date()
) => {
  if (reads.size === 0 || !(await outcomesOn(actor))) {
    return;
  }
  try {
    await refreshOutcomes(actor, { meta: metaTotalsOf(reads), now });
  } catch (error) {
    logOutcomeFailure("OUTCOMES_META_FAILED", error, actor.userId);
  }
};

// Every campaign's lifetime numbers, read from Meta for the daily loop. A
// campaign that can't be read is logged and left out; it keeps its last
// numbers.
const readAllCampaigns = async (actor: Actor) => {
  const rows = await actor.db
    .select()
    .from(campaign)
    .where(eq(campaign.userId, actor.userId));
  const reads = new Map<string, { read: MetaCampaignRead; row: CampaignRow }>();
  if (rows.length === 0) {
    return reads;
  }
  await withProvider(actor, "meta", async (call) => {
    for (const row of rows) {
      try {
        // One campaign at a time: Meta rate-limits the account.
        // oxlint-disable-next-line no-await-in-loop
        const read = await readCampaign(call, {
          adAccountId: row.adAccountId,
          adIds: row.adIds,
          adSetId: row.adSetId,
          metaCampaignId: row.metaCampaignId,
        });
        reads.set(row.id, { read, row });
      } catch (error) {
        logOutcomeFailure("OUTCOMES_META_READ_FAILED", error, actor.userId);
      }
    }
  });
  return reads;
};

/**
 * The daily loop's part: every design's angles, Fourthwall sales and
 * Meta's lifetime numbers. Without Meta (not connected, or it fails) the
 * rest is still recorded and the failure is logged at error level.
 */
export const refreshAllOutcomes = async (actor: Actor, now = new Date()) => {
  let meta = new Map<string, MetaTotals>();
  try {
    meta = metaTotalsOf(await readAllCampaigns(actor));
  } catch (error) {
    logOutcomeFailure("OUTCOMES_META_FAILED", error, actor.userId);
  }
  return await refreshOutcomes(actor, { meta, now });
};

const toOutcome = (row: typeof designOutcome.$inferSelect): DesignOutcome => ({
  addToCarts: row.addToCarts,
  audience: row.audience,
  blank: row.blank,
  clicks: row.clicks,
  dropId: row.dropId,
  impressions: row.impressions,
  launchedAt: row.launchedAt,
  palette: row.palette,
  priceCents: row.priceCents,
  productId: row.productId,
  profitPerSaleCents: row.profitPerSaleCents,
  purchases: row.purchases,
  qlooEntities: row.qlooEntities,
  qlooTags: row.qlooTags,
  revenueCents: row.revenueCents,
  salesCovered: row.salesCovered,
  spendCents: row.spendCents,
  theme: row.theme,
  units: row.units,
});

/**
 * The anonymised prior: how many designs across all merchants count and
 * how many made a profit. Counts only; no merchant's angles leave their
 * account.
 */
export const globalPriorOf = async (
  actor: Pick<Actor, "db">,
  now = new Date()
): Promise<GlobalPrior> => {
  const profit = sql`(case when ${designOutcome.salesCovered} then ${designOutcome.units} else ${designOutcome.purchases} end) * ${designOutcome.profitPerSaleCents} - ${designOutcome.spendCents}`;
  const settledBefore = new Date(now.getTime() - MIN_LIVE_DAYS * DAY_MS);
  const [row] = await actor.db
    .select({
      designs: sql<number>`count(*) filter (where ${designOutcome.launchedAt} <= ${settledBefore} or ${profit} > 0)::int`,
      wins: sql<number>`count(*) filter (where ${profit} > 0)::int`,
    })
    .from(designOutcome);
  return { designs: Number(row?.designs ?? 0), wins: Number(row?.wins ?? 0) };
};

/** The merchant's outcome model, fit from their recorded designs. */
export const outcomeModelFor = async (
  actor: Pick<Actor, "db" | "userId">,
  now = new Date()
): Promise<OutcomeModel> => {
  const [rows, global] = await Promise.all([
    actor.db
      .select()
      .from(designOutcome)
      .where(eq(designOutcome.userId, actor.userId)),
    globalPriorOf(actor, now),
  ]);
  return fitOutcomeModel(rows.map(toOutcome), { global, now });
};

/**
 * Each product's unit economics for the kill rules: the profit per sale,
 * and the merchant's real cost per sale once their ads have made
 * `realCpaMinPurchases` purchases (feedback-loop on).
 */
export const killEconomicsOf = async (
  actor: Actor,
  productIds: string[],
  settings: Pick<AdRuleSettings, "realCpaMinPurchases">
) => {
  const economics = await economicsOf(actor, productIds);
  if (economics.size === 0 || !(await outcomesOn(actor))) {
    return economics;
  }
  const [cost] = await actor.db
    .select({
      purchases: sql<number>`coalesce(sum(${designOutcome.purchases}), 0)::int`,
      spendCents: sql<number>`coalesce(sum(${designOutcome.spendCents}), 0)::int`,
    })
    .from(designOutcome)
    .where(eq(designOutcome.userId, actor.userId));
  const totals = {
    purchases: Number(cost?.purchases ?? 0),
    spendCents: Number(cost?.spendCents ?? 0),
  };
  return new Map(
    [...economics].map(([productId, unit]) => {
      const real = realCostPerSaleOf(
        totals,
        unit.profitCents,
        settings.realCpaMinPurchases
      );
      return [
        productId,
        real === undefined ? unit : { ...unit, realCostPerSaleCents: real },
      ] as const;
    })
  );
};

/**
 * A test's spend floor, design by design (feedback-loop on): each design's
 * share from its angles' track record, or undefined for an even split.
 */
export const testFloorSharesOf = async (
  actor: Actor,
  productIds: string[]
): Promise<Map<string, number> | undefined> => {
  if (productIds.length < 2 || !(await outcomesOn(actor))) {
    return undefined;
  }
  try {
    const [model, designs] = await Promise.all([
      outcomeModelFor(actor),
      attributesOf(actor, productIds),
    ]);
    const byId = new Map(designs.map((item) => [item.productId, item]));
    const multipliers = productIds.map(
      (id) => outcomeScore(byId.get(id) ?? {}, model).multiplier
    );
    const shares = floorShares(multipliers);
    return new Map(productIds.map((id, index) => [id, shares[index] ?? 0]));
  } catch (error) {
    // An even split is the safe fallback: the test still runs.
    logOutcomeFailure("OUTCOMES_FLOOR_FAILED", error, actor.userId);
    return undefined;
  }
};
