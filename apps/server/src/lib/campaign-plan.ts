import { breakeven } from "@wovain/shared/economics";
import type { Settings } from "@wovain/shared/settings";

import type { Store } from "../store.ts";

// Added ads joined with their design's price, plus the campaign budget and the
// rule inputs derived from them, for the plan, rules and widget.
export const addedProducts = async (store: Store, settings: Settings) => {
  const all = await store.getAds();
  const ads = all.filter((ad) => ad.status === "added");
  const products = await Promise.all(
    ads.map(async (ad) => {
      const design = await store.requireDesign(ad.designId);
      const math = breakeven(
        design.quote.price,
        design.quote.baseCost,
        settings.economics
      );
      return { ad, breakevenPerSale: math.perSale, design };
    })
  );
  if (products.length === 0) {
    throw new Error(
      "no ad widgets were added; add at least one before launching"
    );
  }
  return {
    dailyBudget: settings.campaign.dailyBudgetPerProduct * products.length,
    products,
    ruleProducts: products.map(({ ad, breakevenPerSale }) => ({
      breakevenPerSale,
      designId: ad.designId,
    })),
  };
};
