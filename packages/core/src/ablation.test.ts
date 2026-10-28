import { describe, expect, it } from "vitest";

import { armMetrics, meanMetrics, themeOverlap } from "./ablation";
import type { Taste } from "./qloo";

const taste: Taste = {
  affinities: [
    {
      affinity: 0.9,
      because: [{ id: "E1", name: "Studio Ghibli", share: 1 }],
      cues: ["Minimalist", "Trendy"],
      id: "B1",
      name: "Zozotown",
      type: "brand",
    },
    {
      affinity: 0.8,
      because: [],
      cues: ["minimalist", "Cinematic"],
      id: "M1",
      name: "Mirai",
      type: "movie",
    },
  ],
  names: ["Studio Ghibli"],
  seeds: [{ id: "E1", name: "Studio Ghibli", type: "artist" }],
  themes: [],
};

describe("armMetrics", () => {
  it("measures grounding, explanation, cues and distance from the seed", () => {
    const metrics = armMetrics(
      "studio ghibli anime",
      [
        { affinity: 0.9, id: "urn:tag:a", name: "2d animation" },
        { name: "Ghibli anime fan art" },
      ],
      taste
    );

    expect(metrics).toEqual({
      crossDomains: 2,
      cues: 3,
      explained: 0.5,
      grounded: 0.5,
      // "2d animation": both words new; "Ghibli anime fan art": 2 of 4.
      novelty: 0.75,
      themes: 2,
    });
  });

  it("scores an LLM-only arm with no Qloo signal", () => {
    expect(
      armMetrics("pickleball", [{ name: "Retro court" }], {
        names: [],
        themes: [],
      })
    ).toEqual({
      crossDomains: 0,
      cues: 0,
      explained: 0,
      grounded: 0,
      novelty: 1,
      themes: 1,
    });
  });
});

it("averages metrics across seeds", () => {
  const one = {
    crossDomains: 2,
    cues: 4,
    explained: 1,
    grounded: 1,
    novelty: 0.5,
    themes: 3,
  };
  const two = { ...one, cues: 0, grounded: 0 };

  expect(meanMetrics([one, two])).toEqual({ ...one, cues: 2, grounded: 0.5 });
});

it("measures how many themes two arms share", () => {
  expect(
    themeOverlap(["Anime", "Cozy cafe"], ["anime!", "Retro court", "Pixel"])
  ).toBe(0.25);
});
