import type { TrendIdea } from "@wovain/core/trends";
import { expect, it } from "vitest";

import { signalsOf } from "./who-buys";

const ideaWith = (research: Partial<TrendIdea>) =>
  ({
    rank: 1,
    references: [],
    score: 0.8,
    signals: {},
    sources: [],
    theme: "plant care",
    ...research,
  }) as TrendIdea;

it("reads the idea's Qloo seeds, its strongest affinities and its tag", () => {
  const signals = signalsOf(
    ideaWith({
      qlooTag: "urn:tag:genre:media:cottagecore",
      taste: {
        affinities: [
          {
            affinity: 0.2,
            because: [],
            cues: [],
            id: "weak",
            name: "Weak",
            type: "brand",
          },
          {
            affinity: 0.9,
            because: [],
            cues: [],
            id: "strong",
            name: "Strong",
            type: "movie",
          },
        ],
        seeds: [{ id: "seed", name: "Studio Ghibli", type: "movie" }],
      },
    })
  );
  expect(signals.entities).toStrictEqual(["seed", "strong", "weak"]);
  expect(signals.tags).toStrictEqual(["urn:tag:genre:media:cottagecore"]);
});

it("reads only the tag of an idea without a taste map", () => {
  expect(
    signalsOf(ideaWith({ qlooTag: "urn:tag:genre:media:goth" }))
  ).toStrictEqual({ entities: [], tags: ["urn:tag:genre:media:goth"] });
});

it("caps the entities at five", () => {
  const seeds = Array.from({ length: 8 }, (_, index) => ({
    id: `seed-${index}`,
    name: `Seed ${index}`,
    type: "movie",
  }));
  expect(
    signalsOf(ideaWith({ taste: { affinities: [], seeds } })).entities
  ).toHaveLength(5);
});
