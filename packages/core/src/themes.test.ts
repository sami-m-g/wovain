import { describe, expect, it } from "vitest";

import {
  distinctThemes,
  keywordsOf,
  MAX_THEMES,
  qlooThemes,
  RUN_THEMES,
} from "./themes";

const BRIEF = "Spooky Halloween tees for horror movie fans";

describe("themes", () => {
  it("keeps the brief's subject words and drops merch filler", () => {
    expect(keywordsOf(BRIEF)).toEqual([
      "spooky",
      "halloween",
      "horror",
      "movie",
    ]);
  });

  it("never keeps the brief or a reworded duplicate as a theme", () => {
    const themes = distinctThemes(BRIEF, [
      { name: "spooky Halloween TEES for horror movie fans!", query: "x" },
      { name: "Retro slasher VHS", query: "a" },
      { name: "VHS, retro slasher", query: "b" },
      { name: "Haunted humor", query: "c" },
    ]);

    expect(themes.map(({ name }) => name)).toEqual([
      "Retro slasher VHS",
      "Haunted humor",
    ]);
  });

  it("caps themes at the maximum", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      name: `Theme ${index}`,
      query: `q ${index}`,
    }));

    expect(distinctThemes(BRIEF, many)).toHaveLength(MAX_THEMES);
  });
});

describe("qlooThemes", () => {
  it("makes each Qloo tag a theme searched with the brief's subject", () => {
    const themes = qlooThemes(BRIEF, [
      { affinity: 0.7, id: "urn:tag:genre:horror", name: "Horror" },
    ]);

    expect(themes).toEqual([
      {
        affinity: 0.7,
        id: "urn:tag:genre:horror",
        name: "Horror",
        query: "Horror spooky halloween horror movie",
      },
    ]);
  });

  it("makes up nothing when Qloo named no tag", () => {
    expect(qlooThemes(BRIEF, [])).toEqual([]);
  });

  it("keeps at most RUN_THEMES of Qloo's tags", () => {
    const tags = ["anime", "cozy", "pastel", "folk"].map((name) => ({
      affinity: 0.5,
      id: `urn:tag:style:${name}`,
      name,
    }));

    expect(qlooThemes("ghibli", tags)).toHaveLength(RUN_THEMES);
  });
});
