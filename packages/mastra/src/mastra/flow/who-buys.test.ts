import type { TrendIdea } from "@wovain/core/trends";
import { expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { qlooTagOf } from "./ideas";
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

it("reads the buyers from the idea's tag, the age from the brief's entities", () => {
  const { options, signals } = signalsOf(
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
  expect(signals.entities).toStrictEqual([]);
  expect(signals.tags).toStrictEqual(["urn:tag:genre:media:cottagecore"]);
  expect(options).toStrictEqual({
    demographics: ["seed", "strong", "weak"],
    scope: "idea",
  });
});

it("reads only the tag of an idea without a taste map", () => {
  expect(
    signalsOf(ideaWith({ qlooTag: "urn:tag:genre:media:goth" })).signals
  ).toStrictEqual({ entities: [], tags: ["urn:tag:genre:media:goth"] });
});

it("reads the brief's entities for an idea without a tag, and says so", () => {
  const seeds = [{ id: "seed", name: "Seed", type: "movie" }];
  expect(
    signalsOf(ideaWith({ taste: { affinities: [], seeds } }))
  ).toStrictEqual({
    options: { scope: "brief" },
    signals: { entities: ["seed"], tags: [] },
  });
});

it("finds the tag ID of an idea saved with its theme's name", async () => {
  const tagsNamed = vi.fn(async () => await Promise.resolve(["urn:tag:a"]));
  const actor = { core: { qloo: { tagsNamed } } } as unknown as Actor;
  expect(await qlooTagOf(actor, { qlooTag: "Dark Academia" })).toBe(
    "urn:tag:a"
  );
  expect(await qlooTagOf(actor, { qlooTag: "urn:tag:b" })).toBe("urn:tag:b");
  expect(tagsNamed).toHaveBeenCalledTimes(1);
});

it("caps the entities at five", () => {
  const seeds = Array.from({ length: 8 }, (_, index) => ({
    id: `seed-${index}`,
    name: `Seed ${index}`,
    type: "movie",
  }));
  expect(
    signalsOf(ideaWith({ taste: { affinities: [], seeds } })).signals.entities
  ).toHaveLength(5);
});
