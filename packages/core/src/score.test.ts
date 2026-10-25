import { describe, expect, it } from "vitest";

import { priceFor, profitPerSale } from "./pricing";
import {
  ipSafetyOf,
  marginOf,
  median,
  recencyOf,
  SCORE_WEIGHTS,
  scoreIdea,
} from "./score";

const DAY_MS = 86_400_000;

describe("scoreIdea", () => {
  it("weights sum to one, so a perfect idea scores 1", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
    expect(
      scoreIdea({
        affinity: 1,
        ipSafety: 1,
        margin: 1,
        marketHits: 0,
        newsHits: 5,
        recency: 1,
        relevance: 1,
      })
    ).toBe(1);
  });

  it("drops an idea that names a brand Qloo matched", () => {
    const signals = {
      affinity: 0.8,
      margin: 0.5,
      marketHits: 3,
      newsHits: 3,
      recency: 0.5,
      relevance: 0.5,
    };
    expect(scoreIdea({ ...signals, ipSafety: 0 })).toBeLessThan(
      scoreIdea({ ...signals, ipSafety: 1 })
    );
  });
});

describe("signals", () => {
  it("reads margin against the price floor", () => {
    expect(marginOf(undefined, 24)).toBe(0.5);
    expect(marginOf(36, 24)).toBe(1);
    expect(marginOf(12, 24)).toBe(0);
  });

  it("scores today's news fresh and week-old news stale", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(recencyOf([new Date(now).toISOString()], now)).toBe(1);
    expect(recencyOf([new Date(now - 7 * DAY_MS).toISOString()], now)).toBe(0);
    expect(recencyOf([undefined, "not a date"], now)).toBe(0);
  });

  it("flags themes that name a matched entity", () => {
    expect(ipSafetyOf("Taylor Swift eras tour", ["Taylor Swift"])).toBe(0);
    expect(ipSafetyOf("cozy reading club", ["Taylor Swift"])).toBe(1);
  });

  it("takes the median of even and odd lists", () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("priceFor", () => {
  it("rounds up to a whole price that clears the minimum profit", () => {
    const price = priceFor(12);
    expect(price).toBe(24);
    expect(profitPerSale(price, 12)).toBeGreaterThanOrEqual(10);
    expect(profitPerSale(price - 1, 12)).toBeLessThan(10);
  });
});
