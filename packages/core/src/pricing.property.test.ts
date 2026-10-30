import { assert, integer, property } from "fast-check";
import { describe, it } from "vitest";

import {
  baseCostCeiling,
  priceFor,
  pricingRules,
  profitPerSale,
} from "./pricing";

// Property tests: fast-check generates base costs (to the cent, up to $500)
// and checks the pricing rules hold for all of them, not only the examples.
// Runs are capped so CI time barely moves.
const RUNS = { numRuns: 100 };
const MAX_CENTS = 50_000;
const CENT = 0.01;
const EPSILON = 1e-9;

const baseCost = integer({ max: MAX_CENTS, min: 0 }).map((c) => c / 100);

describe("priceFor properties", () => {
  it("is a whole dollar", () => {
    assert(
      property(baseCost, (cost) => Number.isInteger(priceFor(cost))),
      RUNS
    );
  });

  it("clears the minimum profit, after fees, and the margin floor", () => {
    const { minMarginPct, minProfit } = pricingRules();
    assert(
      property(baseCost, (cost) => {
        const price = priceFor(cost);
        const margin = ((price - cost) / price) * 100;
        return (
          profitPerSale(price, cost) >= minProfit - EPSILON &&
          price - cost >= minProfit - EPSILON &&
          margin >= minMarginPct - EPSILON
        );
      }),
      RUNS
    );
  });

  it("never falls when the base cost rises", () => {
    assert(
      property(baseCost, baseCost, (a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        return priceFor(low) <= priceFor(high);
      }),
      RUNS
    );
  });

  it("round-trips with baseCostCeiling", () => {
    assert(
      property(baseCost, (cost) => {
        const price = priceFor(cost);
        const ceiling = baseCostCeiling(price);
        // The ceiling still prices at or under this price, and bounds the
        // cost it came from to the cent the search resolves.
        return (
          priceFor(ceiling) <= price &&
          ceiling >= Math.min(cost, price) - CENT - EPSILON
        );
      }),
      RUNS
    );
  });
});
