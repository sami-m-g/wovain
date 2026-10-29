import { z } from "zod";

import { audienceFor } from "../flow/audiences";
import { protectedProcedure } from "../index";
import { fields } from "./seller";

// Qloo's audience for the merchant's brand as Meta targeting, with the
// evidence behind it (openspec qloo-meta-audiences). Campaign staging uses
// the same targeting and refuses to run without a Qloo audience.
export const targetingRouter = {
  preview: protectedProcedure
    .input(z.object({ countries: fields.countries.default(["US"]) }))
    .handler(
      async ({ context, input }) =>
        await audienceFor(context, { countries: input.countries })
    ),
};
