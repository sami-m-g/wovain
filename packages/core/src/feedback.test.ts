import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEIGHTS_VERSION,
  fitWeights,
  learningsOf,
  MAX_SHIFT,
  MIN_SAMPLES,
  rewardOf,
} from "./feedback";
import type { IdeaOutcome } from "./feedback";
import { SCORE_TERMS, SCORE_WEIGHTS } from "./score";

const signals = {
  affinity: 0.5,
  ipSafety: 1,
  margin: 0.5,
  marketHits: 5,
  newsHits: 2,
  recency: 0.5,
  relevance: 0.6,
};

const outcome = (
  theme: string,
  units: number,
  extra: Partial<IdeaOutcome> = {}
): IdeaOutcome => ({
  clicks: 0,
  ideaId: theme,
  impressions: 0,
  revenueCents: units * 2400,
  signals,
  spendCents: 0,
  theme,
  units,
  ...extra,
});

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("rewardOf", () => {
  it("is 0 without sales and grows with units, below 1", () => {
    expect(rewardOf(outcome("a", 0))).toBe(0);
    const one = rewardOf(outcome("a", 1));
    const five = rewardOf(outcome("a", 5));
    expect(one).toBeGreaterThan(0);
    expect(five).toBeGreaterThan(one);
    expect(five).toBeLessThan(1);
  });

  it("counts the ads' CTR only once they had enough impressions", () => {
    const few = outcome("a", 0, { clicks: 5, impressions: 100 });
    const many = outcome("a", 0, { clicks: 18, impressions: 1000 });
    expect(rewardOf(few)).toBe(0);
    // 1.8% CTR is twice the benchmark: the ad part is full.
    expect(rewardOf(many)).toBeCloseTo(0.3);
  });
});

describe("fitWeights", () => {
  it("keeps the defaults at version 0 with too few samples", () => {
    const fit = fitWeights([outcome("a", 3), outcome("b", 0)]);
    expect(fit.samples).toBe(2);
    expect(fit.changed).toBe(false);
    expect(fit.version).toBe(0);
    expect(fit.weights).toEqual(SCORE_WEIGHTS);
    expect(MIN_SAMPLES).toBe(3);
  });

  it("raises the weight of a term that predicts sales, within its bound", () => {
    // Fresher ideas sold more, across 12 ideas.
    const outcomes = Array.from({ length: 12 }, (_, index) =>
      outcome(`t${index}`, index, {
        signals: { ...signals, recency: index / 11 },
      })
    );
    const fit = fitWeights(outcomes);
    expect(fit.changed).toBe(true);
    expect(fit.version).toBe(1);
    expect(fit.correlations.recency).toBeGreaterThan(0.9);
    expect(fit.weights.recency).toBeGreaterThan(SCORE_WEIGHTS.recency);
    expect(sum(Object.values(fit.weights))).toBeCloseTo(1);
    for (const term of SCORE_TERMS) {
      // Normalising can stretch the bound by the other terms' total shift.
      const prior = SCORE_WEIGHTS[term];
      expect(fit.weights[term]).toBeGreaterThanOrEqual(
        prior * (1 - MAX_SHIFT) * 0.9
      );
      expect(fit.weights[term]).toBeLessThanOrEqual(
        prior * (1 + MAX_SHIFT) * 1.1
      );
    }
  });

  it("is reproducible: the same data refits to the same version", () => {
    const outcomes = Array.from({ length: 6 }, (_, index) =>
      outcome(`t${index}`, index % 3, {
        signals: { ...signals, newsHits: index },
      })
    );
    const first = fitWeights(outcomes);
    const again = fitWeights(outcomes, first);
    expect(again.changed).toBe(false);
    expect(again.version).toBe(first.version);
    expect(again.weights).toEqual(first.weights);
  });

  it("starts from the defaults on version 0", () => {
    expect(DEFAULT_WEIGHTS_VERSION.version).toBe(0);
    expect(DEFAULT_WEIGHTS_VERSION.weights).toEqual(SCORE_WEIGHTS);
  });
});

describe("learningsOf", () => {
  it("lists what sold (most first) and what didn't", () => {
    const learned = learningsOf([
      outcome("Moth tees", 0),
      outcome("Retro slasher VHS", 4, { clicks: 18, impressions: 1000 }),
      outcome("Cottagecore frogs", 1),
    ]);
    expect(learned.sold).toEqual([
      "Retro slasher VHS: 4 sold, $96.00 revenue, CTR 1.8%",
      "Cottagecore frogs: 1 sold, $24.00 revenue",
    ]);
    expect(learned.unsold).toEqual(["Moth tees: no sales"]);
  });
});
