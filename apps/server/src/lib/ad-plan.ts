import { approvedConcepts } from "@wovain/shared/ad";
import type { Ad, AdAsset, AdConcept } from "@wovain/shared/ad";
import type { Design } from "@wovain/shared/design";
import { adName } from "@wovain/shared/rules";

import type { Store } from "../store.ts";

const ofKind = (assets: AdAsset[], kind: AdAsset["kind"]) =>
  assets.flatMap((asset) =>
    asset.kind === kind && asset.status === "ready" && asset.url !== undefined
      ? [{ ratio: asset.ratio, url: asset.url }]
      : []
  );

const metaAd = async (
  designId: string,
  concept: AdConcept,
  designOf: (id: string) => Promise<Design>
) => {
  const cards = await Promise.all(
    (concept.cards ?? []).map(async (card) => {
      const { productUrl } = await designOf(card.designId);
      return {
        headline: card.headline,
        imageUrl: card.imageUrl,
        link: productUrl,
      };
    })
  );
  return {
    adName: adName(designId, concept.id),
    aiMade: concept.assets.some((asset) => asset.source === "fal"),
    ...(cards.length > 0 && { cards }),
    cta: concept.cta,
    headlines: concept.headlines,
    images: ofKind(concept.assets, "image"),
    primaryTexts: concept.primaryTexts,
    videos: ofKind(concept.assets, "video"),
  };
};

// One Meta ad per approved concept, named for the rules ("wovain d1 · c2"):
// its ready visuals, text variants and CTA, whether fal made any of it (for
// Meta's AI disclosure), and a carousel's cards with each product's link.
// Designs the caller already loaded are reused for the cards.
export const approvedAds = async (
  store: Store,
  ad: Ad,
  loaded: Map<string, Design>
) => {
  const designOf = async (id: string) =>
    loaded.get(id) ?? (await store.requireDesign(id));
  return await Promise.all(
    approvedConcepts(ad).map(
      async (concept) => await metaAd(ad.designId, concept, designOf)
    )
  );
};
