import type { ConceptRevision } from "@wovain/shared/ad";
import type { Design } from "@wovain/shared/design";

import type { Store } from "../store.ts";

// Ad visuals are the design's own Fourthwall images or fal output wovain
// collected from jobs it submitted for that design on the merchant's
// account, never an arbitrary link (or someone else's fal output) that would
// end up in a Meta ad.
const owns = (design: Design, recorded: Set<string>, url: string) =>
  recorded.has(url) ||
  url === design.artwork.url ||
  design.mockups.some((mockup) => mockup.url === url);

const sourceOf = async (store: Store, design: Design) => {
  const { urls } = await store.getAdMedia(design.id);
  return { design, recorded: new Set(urls) };
};

// Throws when a concept uses a visual wovain didn't make or a carousel card
// isn't a live design with its own image.
export const checkConcepts = async (
  store: Store,
  design: Design,
  concepts: ConceptRevision[]
) => {
  const cards = concepts.flatMap((concept) => concept.cards ?? []);
  const others = [...new Set(cards.map((card) => card.designId))].filter(
    (id) => id !== design.id
  );
  const loaded = await Promise.all([
    sourceOf(store, design),
    ...others.map(
      async (id) => await sourceOf(store, await store.requireDesign(id))
    ),
  ]);
  const sources = new Map(loaded.map((source) => [source.design.id, source]));
  const own = sources.get(design.id);
  const foreign = concepts.find((concept) =>
    concept.assets.some(
      (asset) =>
        asset.url !== undefined &&
        (own === undefined || !owns(design, own.recorded, asset.url))
    )
  );
  if (foreign !== undefined) {
    throw new Error(
      `${foreign.id}: visuals must be this design's mockups or fal output wovain collected for it (collect_ad_media)`
    );
  }
  const badCard = cards.find((card) => {
    const source = sources.get(card.designId);
    return (
      source?.design.status !== "live" ||
      !owns(source.design, source.recorded, card.imageUrl)
    );
  });
  if (badCard !== undefined) {
    throw new Error(
      `carousel card ${badCard.designId}: needs a live design and its own images`
    );
  }
};
