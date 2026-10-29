import { expect, it } from "vitest";

import { cacheKeyOf, FRESH_MS, KEEP_MS, keepable } from "./drop-directions";

const brand = {
  demographics: { ageAffinity: { "25_to_29": 0.4 } },
  niches: ["Gothic romance"],
  qlooEntities: [{ id: "Q1", name: "Bauhaus", type: "urn:entity:artist" }],
  voice: "dry, never crude",
};

it("keeps one answer per request, brand state and locale", () => {
  const base = cacheKeyOf({ ignoreBrand: false, round: 0 }, brand, "en");
  expect(base.startsWith("brand:0:en:")).toBe(true);
  expect(cacheKeyOf({ ignoreBrand: false, round: 0 }, brand, "fr")).not.toBe(
    base
  );
  expect(
    cacheKeyOf(
      { ignoreBrand: false, round: 0 },
      { ...brand, niches: ["Plant care"] },
      "en"
    )
  ).not.toBe(base);
});

it("shares the open answer between a merchant ignoring the brand and one without", () => {
  expect(cacheKeyOf({ ignoreBrand: true, round: 2 }, brand, "en")).toBe(
    cacheKeyOf({ ignoreBrand: false, round: 2 }, undefined, "en")
  );
  expect(cacheKeyOf({ ignoreBrand: true, round: 2 }, brand, "en")).toBe(
    "open:2:en:none"
  );
});

it("serves a kept answer for longer than it calls it fresh", () => {
  expect(KEEP_MS).toBeGreaterThan(FRESH_MS);
});

it("never keeps an empty answer or one whose reads failed", () => {
  const direction = { theme: "Gothic romance" } as never;
  expect(keepable({ directions: [], tavilyFailed: false })).toBe(false);
  expect(keepable({ directions: [direction], tavilyFailed: true })).toBe(false);
  expect(keepable({ directions: [direction], tavilyFailed: false })).toBe(true);
});
