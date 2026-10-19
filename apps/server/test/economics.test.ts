import { describe, expect, test } from "bun:test";

import { basisCost, breakeven, priceProduct } from "@wovain-foss/shared/economics";
import { defaultSettings } from "@wovain-foss/shared/settings";

const { economics, pricing } = defaultSettings();
const round = (value: number) => Math.round(value * 100) / 100;

describe("breakeven (prd.md > Pricing and economics)", () => {
  test("reproduces the demo tee table at $30", () => {
    const result = breakeven(30, 17.7, economics);
    expect(round(result.cardFees)).toBe(1.38);
    expect(round(result.refundReserve)).toBe(0.6);
    expect(round(result.perSale)).toBe(10.32);
    expect(result.roas).toBeCloseTo(2.9, 1);
    expect(result.roasOnOrderValue).toBeCloseTo(3.6, 1);
  });

  test.each([
    ["upside", 4.5, 0, 1, 10.7],
    ["base", 5, 7, 2, 10.32],
    ["downside", 6.5, 9, 5, 9.36],
  ])("%s case", (_name, shipping, salesTaxPct, refundReservePct, expected) => {
    const result = breakeven(30, 17.7, {
      ...economics,
      refundReservePct,
      salesTaxPct,
      shipping,
    });
    expect(round(result.perSale)).toBe(expected);
  });
});

describe("priceProduct", () => {
  const tee = [
    { baseCost: 17.7, size: "M" },
    { baseCost: 17.7, size: "L" },
  ];

  test("prices the demo tee at $30, not the $28 rule minimum", () => {
    const quote = priceProduct(tee, pricing, economics);
    expect(quote.price).toBe(30);
    expect(round(quote.profit)).toBe(12.3);
    expect(Math.round(quote.marginPct)).toBe(41);
    expect(round(quote.breakeven.perSale)).toBe(10.32);
  });

  test("leaves at least the minimum profit per sale for any base cost", () => {
    for (const baseCost of [8.5, 12, 17.7, 21.4, 34.99]) {
      const quote = priceProduct([{ baseCost, size: "M" }], pricing, economics);
      expect(Number.isInteger(quote.price)).toBe(true);
      expect(quote.breakeven.perSale).toBeGreaterThanOrEqual(pricing.minProfit);
      expect(quote.marginPct).toBeGreaterThanOrEqual(pricing.minMarginPct);
    }
  });

  test("uses the priciest size unless size-weighted is chosen", () => {
    const sizes = [
      { baseCost: 17.7, size: "M", weight: 3 },
      { baseCost: 20.7, size: "2XL", weight: 1 },
    ];
    expect(basisCost(sizes, "priciest-size")).toBe(20.7);
    expect(round(basisCost(sizes, "size-weighted"))).toBe(18.45);
  });

  test("without rounding, prices to the cent", () => {
    const quote = priceProduct(
      tee,
      { ...pricing, roundToCleanPrice: false },
      economics
    );
    expect(quote.breakeven.perSale).toBeGreaterThanOrEqual(10);
    expect(quote.price).toBeLessThan(30);
    expect(round(quote.price)).toBe(quote.price);
  });
});
