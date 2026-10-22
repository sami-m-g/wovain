import type { Ad, AdAsset, AdConcept } from "@wovain/shared/ad";
import { adName } from "@wovain/shared/rules";

import type { Store } from "../store.ts";

const ofKind = (assets: AdAsset[], kind: AdAsset["kind"]) =>
  assets.flatMap((asset) =>
    asset.kind === kind && asset.status === "ready" && asset.url !== undefined
      ? [{ ratio: asset.ratio, url: asset.url }]
      : []
  );

const metaAd = async (store: Store, designId: string, concept: AdConcept) => {
  const cards = concept.cards ?? [];
  const designs = await Promise.all(
    cards.map(async (card) => await store.requireDesign(card.designId))
  );
  return {
    adName: adName(designId, concept.id),
    aiMade: concept.assets.some((asset) => asset.source === "fal"),
    ...(cards.length > 0 && {
      cards: cards.map((card, index) => ({
        headline: card.headline,
        imageUrl: card.imageUrl,
        link: designs[index]?.productUrl,
      })),
    }),
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
export const approvedAds = async (store: Store, ad: Ad) => {
  const approved = ad.concepts.filter(
    (concept) => concept.status === "approved"
  );
  return await Promise.all(
    approved.map(async (concept) => await metaAd(store, ad.designId, concept))
  );
};
