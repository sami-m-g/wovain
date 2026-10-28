import type { z } from "zod";

import type { pricingRulesSchema } from "./pricing";

// The pricing rules the tests run with (vitest.config.ts sets PRICING_RULES
// to them): production's values when they were written. Deployed
// environments get theirs from Pulumi config.
export const TEST_PRICING_RULES = {
  cardFeeFixed: 0.3,
  cardFeePct: 2.9,
  minMarginPct: 30,
  minProfit: 10,
  refundReservePct: 2,
  salesTaxPct: 7,
  shipping: 5,
} satisfies z.input<typeof pricingRulesSchema>;
