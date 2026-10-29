import { priceUnder, profitUnder } from "./pricing";
import type { PricingRules } from "./pricing";

// The Store's price check (openspec store-management): a product's price
// against what Fourthwall charges to make it in each size. It is pure, so
// the reprice dialog runs it in the browser as the merchant types.
//
// The thresholds come from the nexscope profit-margin-calculator-shopify
// skill (DTC stores need a gross margin above 60% to pay for ads, which
// take 20-40% of revenue) and wovain's own floor (PRICING_RULES: minimum
// profit and margin after card fees, tax and the refund reserve).

// The gross margin DTC stores aim for so ads stay affordable.
export const DTC_GROSS_MARGIN = 0.6;

// loss: some size sells at a loss. below_floor: under wovain's minimum
// profit or margin. thin: above the floor but under the DTC benchmark, so
// little room for ads. healthy: above both.
export type PriceVerdict = "loss" | "below_floor" | "thin" | "healthy";

export interface SizeLine {
  size: string;
  // Fourthwall's cost to make it, dollars.
  cost: number;
  price: number;
  // What a sale leaves after fees and the refund reserve.
  profit: number;
  // (price - cost) / price.
  grossMargin: number;
}

export interface PriceCheck {
  verdict: PriceVerdict;
  // The lowest price that clears wovain's floor in every size.
  floorPrice: number;
  // The lowest price that reaches the DTC benchmark in every size.
  benchmarkPrice: number;
  // The least profitable size.
  worst: SizeLine;
  sizes: SizeLine[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// The rules the check reads; the browser gets only these.
export type PriceRules = Pick<
  PricingRules,
  | "cardFeeFixed"
  | "cardFeePct"
  | "minMarginPct"
  | "minProfit"
  | "refundReservePct"
  | "salesTaxPct"
  | "shipping"
  | "sizeSurcharges"
>;

const asRules = (rules: PriceRules): PricingRules => ({
  ...rules,
  // Not read by the price or profit maths.
  defaultBaseCost: 1,
});

// The price that reaches the DTC gross margin on this cost, whole dollars.
const benchmarkFor = (cost: number) => Math.ceil(cost / (1 - DTC_GROSS_MARGIN));

export const checkPrice = (
  rules: PriceRules,
  price: number,
  // Fourthwall's cost per size, dollars.
  costs: Record<string, number>
): PriceCheck | undefined => {
  const full = asRules(rules);
  const surcharges = rules.sizeSurcharges ?? {};
  const sizes = Object.entries(costs)
    .filter(([, cost]) => cost > 0)
    .map(([size, cost]): SizeLine => {
      const sizePrice = price + (surcharges[size] ?? 0);
      return {
        cost,
        grossMargin: sizePrice > 0 ? (sizePrice - cost) / sizePrice : 0,
        price: sizePrice,
        profit: round2(profitUnder(full, sizePrice, cost)),
        size,
      };
    });
  const [worst] = sizes.toSorted((a, b) => a.profit - b.profit);
  if (worst === undefined) {
    return;
  }
  // A surcharged size may carry its own higher cost: the base price must
  // clear the floor in every size once its surcharge is added.
  const needed = (target: (cost: number) => number) =>
    Math.max(
      ...sizes.map((line) => target(line.cost) - (surcharges[line.size] ?? 0))
    );
  const floorPrice = needed((cost) => priceUnder(full, cost));
  const benchmarkPrice = Math.max(floorPrice, needed(benchmarkFor));
  const thinnest = Math.min(...sizes.map((line) => line.grossMargin));
  let verdict: PriceVerdict = "healthy";
  if (worst.profit < 0) {
    verdict = "loss";
  } else if (price < floorPrice) {
    verdict = "below_floor";
  } else if (thinnest < DTC_GROSS_MARGIN) {
    verdict = "thin";
  }
  return { benchmarkPrice, floorPrice, sizes, verdict, worst };
};
