import type {
  CampaignInsight,
  InsightRange,
  ProductSales,
  ShopInsights,
} from "@wovain/core/insights";
import {
  campaignInsights,
  rangeDates,
  shopInsights,
} from "@wovain/core/insights";
import { externalWrite } from "@wovain/db/schema/durable";
import { campaign } from "@wovain/db/schema/seller";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Actor } from "./actor";
import { adScoreKey } from "./campaigns";
import { listConnections, withProvider } from "./connections";

// The merchant's KPI dashboard: shop sales from Fourthwall's reports, ad
// metrics from Meta's insights and quality scores, joined to wovain's own
// drops (runs). The page only renders what this returns.

/**
 * Quality scores: design scores come from each design's judgment; ad
 * scores from the ad judges, which score a campaign's copy when it is
 * staged with model routing on (./campaigns adScoreKey). A campaign staged
 * without them stays unscored, and the page says so.
 */
export interface QualityScorer {
  /** Ad copy scores (0 to 100) by wovain campaign ID. */
  adScores: (
    actor: Actor,
    campaignIds: string[]
  ) => Promise<Map<string, number>>;
}

const adScoreSchema = z.object({ score: z.number().min(0).max(100) });

export const storedAdScores: QualityScorer = {
  adScores: async ({ db, userId }, campaignIds) => {
    if (campaignIds.length === 0) {
      return new Map<string, number>();
    }
    const staged = await db
      .select({ id: campaign.id, key: campaign.idempotencyKey })
      .from(campaign)
      .where(
        and(eq(campaign.userId, userId), inArray(campaign.id, campaignIds))
      );
    const byKey = new Map(
      staged.flatMap((row) =>
        row.key === null ? [] : [[adScoreKey(row.key), row.id] as const]
      )
    );
    if (byKey.size === 0) {
      return new Map<string, number>();
    }
    const scored = await db
      .select({ key: externalWrite.key, result: externalWrite.result })
      .from(externalWrite)
      .where(
        and(
          eq(externalWrite.userId, userId),
          eq(externalWrite.state, "done"),
          inArray(externalWrite.key, [...byKey.keys()])
        )
      );
    return new Map(
      scored.flatMap((row) => {
        const id = byKey.get(row.key);
        const parsed = adScoreSchema.safeParse(row.result);
        return id === undefined || !parsed.success
          ? []
          : [[id, parsed.data.score] as const];
      })
    );
  },
};

/** A source's part of the dashboard: its data, or why there is none. */
type Section<T> =
  | ({ status: "ok" } & T)
  | { status: "not_connected" }
  | { message: string; status: "unavailable" };

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const settle = async <T>(work: () => Promise<T>): Promise<Section<T>> => {
  try {
    return { status: "ok", ...(await work()) };
  } catch (error) {
    return { message: reasonOf(error), status: "unavailable" };
  }
};

const PERCENT = 100;

const mean = (values: number[]) =>
  values.length === 0
    ? undefined
    : values.reduce((total, value) => total + value, 0) / values.length;

const ratio = (part: number, whole: number) =>
  whole > 0 ? part / whole : undefined;

/** Spend-weighted ROAS across the campaigns that report one. */
const blendedRoas = (campaigns: CampaignInsight[]) => {
  const reporting = campaigns.filter((item) => item.roas !== undefined);
  const spend = reporting.reduce((total, item) => total + item.spend, 0);
  return ratio(
    reporting.reduce((total, item) => total + (item.roas ?? 0) * item.spend, 0),
    spend
  );
};

const adTotals = (campaigns: CampaignInsight[]) => {
  const spend = campaigns.reduce((total, item) => total + item.spend, 0);
  const clicks = campaigns.reduce((total, item) => total + item.clicks, 0);
  const impressions = campaigns.reduce(
    (total, item) => total + item.impressions,
    0
  );
  const results = campaigns.reduce((total, item) => total + item.results, 0);
  const ctr = ratio(clicks, impressions);
  return {
    clicks,
    cpa: ratio(spend, results),
    ctr: ctr === undefined ? undefined : ctr * PERCENT,
    impressions,
    results,
    roas: blendedRoas(campaigns),
    spend,
  };
};

const loadDrops = async ({ db, userId }: Actor) =>
  await db.query.run.findMany({
    orderBy: { createdAt: "desc" },
    where: { userId },
    with: {
      designs: { with: { products: { with: { campaigns: true } } } },
    },
  });

type Drop = Awaited<ReturnType<typeof loadDrops>>[number];

const campaignsOf = (drop: Drop) =>
  drop.designs.flatMap((design) =>
    design.products.flatMap((product) => product.campaigns)
  );

const metaAds = async (
  actor: Actor,
  drops: Drop[],
  range: InsightRange
): Promise<CampaignInsight[]> => {
  const byAccount = new Map<string, string[]>();
  for (const staged of drops.flatMap(campaignsOf)) {
    byAccount.set(staged.adAccountId, [
      ...(byAccount.get(staged.adAccountId) ?? []),
      staged.metaCampaignId,
    ]);
  }
  if (byAccount.size === 0) {
    return [];
  }
  return await withProvider(actor, "meta", async (call) => {
    const pages = await Promise.all(
      [...byAccount].map(
        async ([adAccountId, campaignIds]) =>
          await campaignInsights(call, { adAccountId, campaignIds, range })
      )
    );
    return pages.flat();
  });
};

/** One drop's row: what it made, how it sold, what its ads did, its scores. */
const dropRow = (
  drop: Drop,
  sales: Map<string, ProductSales>,
  ads: Map<string, CampaignInsight>,
  adScores: Map<string, number>
) => {
  const staged = campaignsOf(drop);
  const titles = drop.designs.map((design) => design.brief.title);
  const sold = titles.flatMap((title) => {
    const found = sales.get(title.toLowerCase());
    return found ? [found] : [];
  });
  const metrics = staged.flatMap((item) => {
    const found = ads.get(item.metaCampaignId);
    return found ? [found] : [];
  });
  const scored = staged.flatMap((item) => {
    const score = adScores.get(item.id);
    return score === undefined ? [] : [score];
  });
  return {
    adScore: mean(scored),
    campaigns: staged.length,
    createdAt: drop.createdAt,
    designScore: mean(drop.designs.map((design) => design.judgment.score)),
    designs: drop.designs.length,
    id: drop.id,
    products: drop.designs.reduce(
      (total, design) => total + design.products.length,
      0
    ),
    profit: sold.reduce((total, item) => total + item.profit, 0),
    revenue: sold.reduce((total, item) => total + item.revenue, 0),
    seed: drop.seed,
    spend: metrics.reduce((total, item) => total + item.spend, 0),
    status: drop.status,
    unitsSold: sold.reduce((total, item) => total + item.unitsSold, 0),
  };
};

export const getInsights = async (
  actor: Actor,
  range: InsightRange,
  scorer: QualityScorer = storedAdScores
) => {
  const [drops, connections] = await Promise.all([
    loadDrops(actor),
    listConnections(actor),
  ]);
  const connected = (provider: string) =>
    connections.some((item) => item.provider === provider);

  const [shop, ads, adScores] = await Promise.all([
    connected("fourthwall")
      ? settle(
          async () =>
            await withProvider(
              actor,
              "fourthwall",
              async (call) => await shopInsights(call, rangeDates(range))
            )
        )
      : ({ status: "not_connected" } as const),
    connected("meta")
      ? settle(async () => {
          const campaigns = await metaAds(actor, drops, range);
          return { campaigns, totals: adTotals(campaigns) };
        })
      : ({ status: "not_connected" } as const),
    scorer.adScores(
      actor,
      drops.flatMap(campaignsOf).map((item) => item.id)
    ),
  ]);

  const sales = new Map<string, ProductSales>(
    shop.status === "ok"
      ? shop.products.map((item) => [item.name.toLowerCase(), item])
      : []
  );
  const metrics = new Map<string, CampaignInsight>(
    ads.status === "ok" ? ads.campaigns.map((item) => [item.id, item]) : []
  );

  return {
    ads,
    drops: drops.map((drop) => dropRow(drop, sales, metrics, adScores)),
    range: { ...rangeDates(range), key: range },
    scoring: { ads: adScores.size > 0 ? "ready" : "pending" } as const,
    shop: shop as Section<ShopInsights>,
  };
};
