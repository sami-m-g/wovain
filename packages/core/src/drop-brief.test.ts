import { describe, expect, it } from "vitest";

import { listingFor, visionChecks } from "./drop-brief";
import type { DropBrief } from "./drop-brief";

const BRIEF: DropBrief = {
  description: "Night shift.",
  garmentColors: ["black"],
  graphicPrompt: "A moth over a full moon, linocut",
  graphicText: [],
  labelText: "Wovain",
  listings: [
    { description: "Two lines.", kind: "hero_tee", title: "Moth Tee" },
  ],
  markPrompt: "A moth monogram, bold",
  name: "Night Shift",
  palette: ["#111111", "#f2e8d5", "#c0392b"],
  patternPrompt: "Small moths repeating",
  sleeveText: "",
};

describe("listingFor", () => {
  it("uses the model's listing for the kind, or the drop's name", () => {
    expect(listingFor(BRIEF, "hero_tee").title).toBe("Moth Tee");
    expect(listingFor(BRIEF, "sticker").title).toBe(
      "Night Shift Die-cut sticker"
    );
  });
});

describe("visionChecks", () => {
  it("fails a product the model skipped", () => {
    const checks = visionChecks(
      {
        drop_cohesion: { note: "One palette.", pass: true },
        items: [
          {
            hierarchy: { note: "Quiet front.", pass: true },
            placement_fit: { note: "Centered.", pass: true },
            position: 0,
          },
        ],
      },
      [{ position: 0 }, { position: 1 }]
    );
    expect(
      checks.map((check) => [check.rule, check.position, check.pass])
    ).toEqual([
      ["placement_fit", 0, true],
      ["hierarchy", 0, true],
      ["placement_fit", 1, false],
      ["hierarchy", 1, false],
      ["drop_cohesion", undefined, true],
    ]);
  });
});
