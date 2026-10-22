import { createHash } from "node:crypto";

import type { Design } from "@wovain/shared/design";
import { breakeven } from "@wovain/shared/economics";
import type { Settings } from "@wovain/shared/settings";

import type { Store } from "../store.ts";
import { approvedAds } from "./ad-plan.ts";
import { snapshotOf } from "./meta-staged.ts";
import type { Staged } from "./meta-staged.ts";
import { hiddenDrops } from "./publish-design.ts";

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
// product links (the added products' and their carousel cards', each also
// with the URL tags when the merchant keeps them on), the media URLs of the
// approved concepts (visuals, carousel cards and the static image), the
// approved ads themselves (the launch approval covers them), and the campaign
// wovain staged, if any.
export const draftPlan = async (store: Store, settings: Settings) => {
  const [{ dailyBudget, products }, saved] = await Promise.all([
    addedProducts(store, settings),
    store.getCampaign(),
  ]);
  const loaded = new Map(products.map(({ design }) => [design.id, design]));
  const ads = await Promise.all(
    products.map(async ({ ad }) => ({
      ads: await approvedAds(store, ad, loaded),
      designId: ad.designId,
    }))
  );
  const metaAds = ads.flatMap((product) => product.ads);
  const links = [
    ...new Set([
      ...products.flatMap(({ design }) =>
        design.productUrl === undefined ? [] : [design.productUrl]
      ),
      ...metaAds.flatMap((ad) =>
        (ad.cards ?? []).flatMap((card) =>
          card.link === undefined ? [] : [card.link]
        )
      ),
    ]),
  ];
  return {
    ads,
    campaignId: saved?.campaignId,
    dailyBudgetCents: Math.round(dailyBudget * 100),
    linkUrls: settings.rules.tagUtmContent
      ? [...links, ...links.flatMap((link) => tagged(link))]
      : links,
    mediaUrls: [
      ...new Set([
        ...products.map(({ ad }) => ad.staticImage.url),
        ...metaAds.flatMap((ad) => [
          ...ad.images.map((image) => image.url),
          ...ad.videos.map((video) => video.url),
          ...(ad.cards ?? []).map((card) => card.imageUrl),
        ]),
      ]),
    ],
  };
};
export type DraftPlan = Awaited<ReturnType<typeof draftPlan>>;

// What the merchant confirms on the launch page: the staged draft and, when
// autopilot made hidden drops, exactly which designs, offers and collections
// the launch makes public. Any other set doesn't match the confirmation.
export const launchSnapshot = (
  staged: Staged,
  concepts: unknown,
  designs: Design[]
) => {
  const drops = hiddenDrops(designs);
  return drops.length === 0
    ? snapshotOf(staged, concepts)
    : `${snapshotOf(staged, concepts)}.${createHash("sha256").update(JSON.stringify(drops)).digest("base64url")}`;
};
