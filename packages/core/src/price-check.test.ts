import { describe, expect, it } from "vitest";

import { checkPrice, DTC_GROSS_MARGIN } from "./price-check";
import type { PriceRules } from "./price-check";

const RULES: PriceRules = {
  cardFeeFixed: 0.3,
  cardFeePct: 2.9,
  minMarginPct: 30,
  minProfit: 10,
  refundReservePct: 3,
  salesTaxPct: 0,
  shipping: 0,
  sizeSurcharges: { "2XL": 2 },
};

const COSTS = { "2XL": 16, L: 13, M: 13 };

describe("checkPrice", () => {
  it("is healthy above the floor and the DTC margin in every size", () => {
    const check = checkPrice(RULES, 45, COSTS);
    expect(check?.verdict).toBe("healthy");
    expect(
      check?.sizes.every((line) => line.grossMargin >= DTC_GROSS_MARGIN)
    ).toBe(true);
  });

  it("is thin when it clears the floor but not the margin ads need", () => {
    const check = checkPrice(RULES, 26, COSTS);
    expect(check?.verdict).toBe("thin");
    expect(check?.benchmarkPrice).toBeGreaterThan(26);
  });

  it("is below the floor when the profit per sale is under the minimum", () => {
    const check = checkPrice(RULES, 20, COSTS);
    expect(check?.verdict).toBe("below_floor");
    expect(check?.floorPrice).toBeGreaterThan(20);
  });

  it("flags a loss in the costliest size", () => {
    const check = checkPrice(RULES, 14, { ...COSTS, "2XL": 18 });
    expect(check?.verdict).toBe("loss");
    expect(check?.worst.size).toBe("2XL");
  });

  it("counts the surcharge when it sets the floor", () => {
    const check = checkPrice(RULES, 30, COSTS);
    const floor = check?.floorPrice ?? 0;
    expect(checkPrice(RULES, floor, COSTS)?.verdict).not.toBe("below_floor");
    expect(checkPrice(RULES, floor - 1, COSTS)?.verdict).toMatch(
      /below_floor|loss/u
    );
  });

  it("has nothing to say without a cost", () => {
    expect(checkPrice(RULES, 30, {})).toBeUndefined();
  });
});
