import { designResultsOf } from "@wovain/core/ad-rules";
import type { DesignSlice } from "@wovain/core/ad-rules";
import { readCampaign } from "@wovain/core/optimizer-meta";
import { design, product } from "@wovain/db/schema/seller";
import { and, eq, inArray } from "drizzle-orm";

import type { Actor } from "./actor";
import { adResultsOf, adRulesOf } from "./ad-rules";
import { withProvider } from "./connections";
import { campaignOf } from "./media";
import { killEconomicsOf } from "./outcomes";

// A drop's test campaign, design by design (openspec ads-design-test):
// spend, CTR, add-to-carts, purchases and profit from Meta's lifetime
// numbers, and where the profit rules have each design (testing, paused and
// why, or the winner they scale). A one-design campaign is one row.

const NO_ECONOMICS = { priceCents: 0, profitCents: 0 };

export const campaignDesignResults = async (
  actor: Actor,
  campaignId: string
) => {
  const row = await campaignOf(actor, campaignId);
  const designs = row.designs ?? [
    {
      adIds: row.adIds,
      adSetId: row.adSetId,
      copy: row.copy,
      creativeIds: row.creativeIds,
      productId: row.productId,
    },
  ];
  const productIds = designs.map((each) => each.productId);
  const settings = await adRulesOf(actor);
  const [economics, products] = await Promise.all([
    killEconomicsOf(actor, productIds, settings),
    actor.db
      .select({
        brief: design.brief,
        id: product.id,
        mockups: product.mockups,
      })
      .from(product)
      .innerJoin(design, eq(design.id, product.designId))
      .where(
        and(eq(product.userId, actor.userId), inArray(product.id, productIds))
      ),
  ]);
  const read = await withProvider(
    actor,
    "meta",
    async (call) =>
      await readCampaign(call, {
        adAccountId: row.adAccountId,
        adIds: row.adIds,
        adSetId: row.adSetId,
        metaCampaignId: row.metaCampaignId,
      })
  );
  const slices: DesignSlice[] = designs.map((each) => ({
    adIds: each.adIds,
    economics: economics.get(each.productId) ?? NO_ECONOMICS,
    key: each.productId,
  }));
  const byId = new Map(products.map((each) => [each.id, each]));
  return {
    campaignId: row.id,
    designs: designResultsOf(adResultsOf(read.ads), slices, settings).map(
      (result) => ({
        ...result,
        imageUrl: byId.get(result.key)?.mockups[0] ?? null,
        productId: result.key,
        title: byId.get(result.key)?.brief.title ?? null,
      })
    ),
    live: read.live,
  };
};
