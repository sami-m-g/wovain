import { describe, expect, it } from "vitest";

import { unsupportedClaims } from "./grounding";

// The grounding guard: a number or a claim in what an agent writes for the
// merchant must come from what the tools gave it (the prompt).

describe("unsupportedClaims", () => {
  it("passes copy whose numbers all come from the evidence", () => {
    expect(
      unsupportedClaims(
        "Moth tee, 2 colors, 30% off this week",
        '{"colors":["black","sand"],"promo":"30% off","count":2}'
      )
    ).toEqual([]);
  });

  it("flags a number no tool produced", () => {
    expect(
      unsupportedClaims("Loved by 10,000 fans", '{"title":"Moth tee"}')
    ).toEqual(["10,000"]);
  });

  it("matches numbers however they are grouped", () => {
    expect(unsupportedClaims("10,000 searches", "volume 10000")).toEqual([]);
  });

  it("flags money and percentages", () => {
    expect(unsupportedClaims("Only $19.99, 50% off", "a tee")).toEqual([
      "$19.99",
      "50%",
    ]);
  });

  it("ignores decades, hex colors and names with digits", () => {
    expect(
      unsupportedClaims(
        "A 90s and 1970s look in #1a1a1a ink, Y2K chrome, 3D type",
        "a retro tee"
      )
    ).toEqual([]);
  });

  it("flags a superlative claim the evidence doesn't make", () => {
    expect(
      unsupportedClaims("Our best-selling, award-winning tee", "a tee")
    ).toEqual(["best-selling", "award-winning"]);
  });

  it("allows a claim the evidence makes", () => {
    expect(
      unsupportedClaims(
        "The #1 moth tee",
        '{"headline":"#1 moth tee on the chart"}'
      )
    ).toEqual([]);
  });
});
