import { PRICING, priceFor, profitPerSale } from "@wovain/core/pricing";

const percent = (value: number) => value / 100;
const cents = (value: number) => Math.round(value * 100) / 100;

/** The price wovain sets for a blank, line by line, from the same rule the flow uses. */
export const priceBreakdown = (baseCost: number) => {
  const price = priceFor(baseCost);
  const tax = price * percent(PRICING.salesTaxPct);
  const cardFees =
    (price + PRICING.shipping + tax) * percent(PRICING.cardFeePct) +
    PRICING.cardFeeFixed;
  const profit = profitPerSale(price, baseCost);
  return {
    baseCost,
    cardFees: cents(cardFees),
    marginPct: Math.round(((price - baseCost) / price) * 100),
    price,
    profit: cents(profit),
    refundReserve: cents(price * percent(PRICING.refundReservePct)),
  };
};

/** Blank costs shown in the public price table. */
export const EXAMPLE_BASE_COSTS = [8, 12, 15, 20, 25] as const;
