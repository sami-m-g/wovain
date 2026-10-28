import { defineRelations } from "drizzle-orm";

import * as auth from "./schema/auth";
import * as autonomy from "./schema/autonomy";
import * as seller from "./schema/seller";

export const relations = {
  ...defineRelations({ ...auth, ...autonomy, ...seller }, (r) => ({
    // A run's output, step by step: ideas → designs → products → campaigns.
    design: {
      products: r.many.product({ from: r.design.id, to: r.product.designId }),
    },
    product: {
      campaigns: r.many.campaign({
        from: r.product.id,
        to: r.campaign.productId,
      }),
    },
    run: {
      designs: r.many.design({ from: r.run.id, to: r.design.runId }),
      ideas: r.many.idea({ from: r.run.id, to: r.idea.runId }),
    },
  })),
  ...auth.authRelations,
};
