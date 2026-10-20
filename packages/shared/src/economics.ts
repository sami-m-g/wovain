import { z } from "zod";

import type { Settings } from "./settings.ts";

// prd.md > Pricing and economics. Amounts are dollars; round only for display.

export const sizeCostSchema = z.object({
  baseCost: z.number().positive(),
  size: z.string().min(1),
  // Share of expected sales for the size-weighted basis; equal when omitted.
  weight: z.number().positive().optional(),
});
export type SizeCost = z.infer<typeof sizeCostSchema>;

type Economics = Settings["economics"];
type Pricing = Settings["pricing"];

export interface Breakeven {
  cardFees: number;
  perSale: number;
  refundReserve: number;
  // Price ÷ breakeven per sale: the ROAS target on product price.
  roas: number;
  // The same target when the pixel reports price + shipping + tax.
  roasOnOrderValue: number;
  salesTax: number;
}

export const money = (value: number) => `$${value.toFixed(2)}`;

const percent = (value: number) => value / 100;

export const breakeven = (
  price: number,
  baseCost: number,
  economics: Economics
): Breakeven => {
  const salesTax = price * percent(economics.salesTaxPct);
  const orderValue = price + economics.shipping + salesTax;
  const cardFees =
    orderValue * percent(economics.cardFeePct) + economics.cardFeeFixed;
  const refundReserve = price * percent(economics.refundReservePct);
  const perSale = price - baseCost - cardFees - refundReserve;
  return {
    cardFees,
    perSale,
    refundReserve,
    roas: perSale > 0 ? price / perSale : Number.POSITIVE_INFINITY,
    roasOnOrderValue:
      perSale > 0 ? orderValue / perSale : Number.POSITIVE_INFINITY,
    salesTax,
  };
};

// The base cost the math protects: the priciest size by default, because 2XL
// and up cost more, or the size-weighted average when the merchant opts in.
export const basisCost = (
  sizes: SizeCost[],
  basis: Economics["breakevenBasis"]
) => {
  if (sizes.length === 0) {
    throw new Error("No sizes to price");
  }
  if (basis === "priciest-size") {
    return Math.max(...sizes.map((size) => size.baseCost));
  }
  const total = sizes.reduce((sum, size) => sum + (size.weight ?? 1), 0);
  return sizes.reduce(
    (sum, size) => sum + (size.baseCost * (size.weight ?? 1)) / total,
    0
  );
};

const cents = (value: number) => Math.ceil(Math.round(value * 1e6) / 1e4) / 100;

export interface PriceQuote {
  baseCost: number;
  breakeven: Breakeven;
  marginPct: number;
  price: number;
  profit: number;
}

// At least the minimum profit or the minimum margin, whichever is greater,
// then raised to the next clean (whole-dollar) price that still leaves the
// minimum profit per sale after fees and reserve ($28 → $30 for the demo tee).
export const priceProduct = (
  sizes: SizeCost[],
  pricing: Pricing,
  economics: Economics
): PriceQuote => {
  const baseCost = basisCost(sizes, economics.breakevenBasis);
  const ruleMinimum = Math.max(
    baseCost + pricing.minProfit,
    baseCost / (1 - percent(pricing.minMarginPct))
  );
  const step = pricing.roundToCleanPrice ? 1 : 0.01;
  let price = pricing.roundToCleanPrice
    ? Math.ceil(cents(ruleMinimum))
    : cents(ruleMinimum);
  while (breakeven(price, baseCost, economics).perSale < pricing.minProfit) {
    price = cents(price + step);
  }
  const profit = price - baseCost;
  return {
    baseCost,
    breakeven: breakeven(price, baseCost, economics),
    marginPct: (profit / price) * 100,
    price,
    profit,
  };
};
