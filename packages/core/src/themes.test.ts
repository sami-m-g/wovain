import { describe, expect, it, vi } from "vitest";

import type { Nemotron } from "./nemotron";
import {
  distinctThemes,
  fallbackThemes,
  keywordsOf,
  MAX_THEMES,
  suggestThemes,
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

describe("suggestThemes with learnings", () => {
  const reply = { themes: [{ name: "Retro slasher VHS", query: "vhs" }] };

  it("passes what sold and what didn't to the model as data", async () => {
    const ask = vi.fn().mockResolvedValue(reply);
    const learned = {
      sold: ["Retro slasher VHS: 4 sold, $96.00 revenue"],
      unsold: ["Moth tees: no sales"],
    };

    await suggestThemes(
      ask as unknown as Nemotron,
      BRIEF,
      [],
      undefined,
      learned
    );

    const [{ prompt, system }] = ask.mock.calls[0] as [
      { prompt: string; system: string },
    ];
    expect(JSON.parse(prompt)).toEqual({ brief: BRIEF, learned, taken: [] });
    expect(system).toContain("learned");
  });

  it("leaves learned out when there is nothing to learn yet", async () => {
    const ask = vi.fn().mockResolvedValue(reply);

    await suggestThemes(ask as unknown as Nemotron, BRIEF, [], undefined, {
      sold: [],
      unsold: [],
    });

    const [{ prompt }] = ask.mock.calls[0] as [{ prompt: string }];
    expect(JSON.parse(prompt)).toEqual({ brief: BRIEF, taken: [] });
  });
});
