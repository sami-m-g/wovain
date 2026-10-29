import { INSIGHT_RANGES } from "@wovain/core/insights";
import { getInsights } from "@wovain/mastra/flow/insights";
import { z } from "zod";

import { protectedProcedure } from "../index";

// The merchant's KPI dashboard: shop, ads and quality per drop.
export const insightsRouter = {
  overview: protectedProcedure
    .input(z.object({ range: z.enum(INSIGHT_RANGES).default("28d") }))
    .handler(
      async ({ context, input }) => await getInsights(context, input.range)
    ),
};
