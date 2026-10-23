import type { SavedCampaign } from "@wovain/shared/campaign";
import type { Design } from "@wovain/shared/design";
import type { ActionRecord } from "@wovain/shared/optimizer/records";
import type { Settings } from "@wovain/shared/settings";

import type { Store } from "../../store.ts";

// wovain's own records for one merchant (spec section 3, Observe): the live
// designs and every Fourthwall product in their drops, the campaign, the
// settings and the optimizer's recent actions.

export interface Wovain {
  actions: ActionRecord[];
  campaign: SavedCampaign | undefined;
  // Each Fourthwall product id to the design whose drop it's in.
  designOf: (productId: string) => string | undefined;
  designs: Design[];
  productIds: string[];
  settings: Settings;
}

const productsOf = (design: Design) => [
  design.productId,
  ...design.range.map((product) => product.offerId),
];

export const readWovain = async (store: Store): Promise<Wovain> => {
  const [designs, campaign, settings, actions] = await Promise.all([
    store.getDesigns(),
    store.getCampaign(),
    store.getSettings(),
    store.getOptimizerActions(200),
  ]);
  const live = designs.filter(
    (design) => design.status === "live" && design.productId !== undefined
  );
  const owner = new Map(
    live.flatMap((design) =>
      productsOf(design).flatMap((id) =>
        id === undefined ? [] : [[id, design.id] as const]
      )
    )
  );
  return {
    actions,
    campaign,
    designOf: (productId) => owner.get(productId),
    designs: live,
    productIds: [...owner.keys()],
    settings,
  };
};
