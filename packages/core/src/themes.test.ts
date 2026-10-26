import { describe, expect, it } from "vitest";

import {
  distinctThemes,
  fallbackThemes,
  keywordsOf,
  MAX_THEMES,
  themesSchema,
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

  it("titles fallback themes by angle and subject, never the brief", () => {
    const names = fallbackThemes(BRIEF).map(({ name }) => name);

    expect(names).toEqual([
      "Retro Spooky Halloween Horror Movie",
      "Minimalist Spooky Halloween Horror Movie",
      "Funny Spooky Halloween Horror Movie",
    ]);
  });

  it("accepts long model text instead of failing the run", () => {
    const long = "word ".repeat(500);

    expect(
      themesSchema.safeParse({ themes: [{ name: long, query: long }] }).success
    ).toBe(true);
  });
});
