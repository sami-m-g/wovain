import { breakeven } from "@wovain/shared/economics";
import type { Settings } from "@wovain/shared/settings";

import type { Store } from "../store.ts";

// Each link carries the ad's ID so Fourthwall sales can be matched to the ad.
export const URL_TAGS =
  "utm_source=meta&utm_medium=paid&utm_campaign=wovain&utm_content={{ad.id}}";

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

// A product link with the URL tags added, as the playbook writes it ("?")
// or joined to an existing query ("&").
const tagged = (link: string) => [`${link}?${URL_TAGS}`, `${link}&${URL_TAGS}`];

// What a campaign draft may contain, from the plan: the budget in cents, the
// product links (each also with the URL tags when the merchant keeps them on),
// the media URLs of the added ads, and the campaign wovain staged, if any.
export const draftPlan = async (store: Store, settings: Settings) => {
  const [{ dailyBudget, products }, saved] = await Promise.all([
    addedProducts(store, settings),
    store.getCampaign(),
  ]);
  const links = products.flatMap(({ design }) =>
    design.productUrl === undefined ? [] : [design.productUrl]
  );
  return {
    campaignId: saved?.campaignId,
    dailyBudgetCents: Math.round(dailyBudget * 100),
    linkUrls: settings.rules.tagUtmContent
      ? [...links, ...links.flatMap((link) => tagged(link))]
      : links,
    mediaUrls: products.flatMap(({ ad }) => [
      ad.staticImage.url,
      ...ad.concepts.flatMap((concept) =>
        concept.status === "approved"
          ? concept.assets.flatMap((asset) =>
              asset.status === "ready" && asset.url !== undefined
                ? [asset.url]
                : []
            )
          : []
      ),
    ]),
  };
};
export type DraftPlan = Awaited<ReturnType<typeof draftPlan>>;
