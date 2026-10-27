import { describe, expect, it } from "vitest";

import {
  copyChecks,
  designChecks,
  priceClearsFloor,
  stepScorers,
} from "./step-scorers";

const facts = {
  artworkWidth: 2880,
  avoidNames: ["Garfield"],
  description: "Two lines.",
  printedText: ["One more chapter"],
  text: "Reading Cat Tee\nA sleepy cat with a book",
  title: "Reading Cat Tee",
};

describe("step code scorers", () => {
  it("checks a design's facts", () => {
    expect(Object.values(designChecks(facts)).every(Boolean)).toBe(true);
    expect(
      designChecks({ ...facts, artworkWidth: 1024, text: "garfield reads" })
    ).toMatchObject({ avoidedNames: false, printSize: false });
  });

  it("checks the price floor and ad lengths", () => {
    expect(priceClearsFloor(29)).toBe(true);
    expect(priceClearsFloor(12)).toBe(false);
    expect(
      copyChecks({ variants: [{ headline: "x".repeat(41), message: "ok" }] })
    ).toEqual([false, true]);
  });

  it("scores the share of passing checks from a step's output", async () => {
    const scored = await stepScorers.design_facts.run({
      output: { facts: { ...facts, artworkWidth: 1024 } },
    });
    expect(scored.score).toBeCloseTo(0.8, 5);
    const missing = await stepScorers.price_floor.run({ output: {} });
    expect(missing.score).toBe(0);
  });

  it("averages a step that made one item per design", async () => {
    const scored = await stepScorers.design_facts.run({
      output: { facts: [facts, { ...facts, artworkWidth: 1024 }] },
    });
    expect(scored.score).toBeCloseTo(0.9, 5);
    const prices = await stepScorers.price_floor.run({
      output: { facts: [{ price: 29 }, { price: 12 }] },
    });
    expect(prices.score).toBe(0.5);
  });
});
