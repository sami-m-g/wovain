import { z } from "zod";

import { audienceFor, requireQlooAudiences } from "../flow/audiences";
import { protectedProcedure } from "../index";
import { fields } from "./seller";

// Qloo's audience for the merchant's brand as Meta targeting, with the
// evidence behind it (openspec qloo-meta-audiences), behind the
// qloo-audiences flag. Campaign staging uses the same targeting.
export const targetingRouter = {
  preview: protectedProcedure
    .input(z.object({ countries: fields.countries.default(["US"]) }))
    .handler(async ({ context, input }) => {
      await requireQlooAudiences(context);
      return await audienceFor(context, { countries: input.countries });
    }),
};
