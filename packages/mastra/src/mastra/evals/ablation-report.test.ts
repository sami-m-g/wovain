import { expect, it } from "vitest";

import { qlooAblation } from "./ablation-report";

it("reads the committed ablation the ideas step shows", () => {
  const { at, llmOnly, model, seeds, withQloo } = qlooAblation;
  expect(Number.isNaN(Date.parse(at))).toBe(false);
  expect(model).not.toBe("");
  expect(seeds.length).toBeGreaterThan(0);
  // Only Qloo grounds a theme in its taste graph.
  expect(withQloo.grounded).toBeGreaterThan(0);
  expect(llmOnly.grounded).toBe(0);
  expect(llmOnly.crossDomains).toBe(0);
  for (const seed of seeds) {
    expect(seed.llmOnly.length).toBeGreaterThan(0);
  }
});
