import { describe, expect, it } from "vitest";

import {
  catalogCost,
  chooseStyleFamily,
  DROP_MIX,
  pickColors,
  planPlacements,
  priceFromCost,
  PRODUCT_KINDS,
  STYLE_FAMILIES,
} from "./drops";
import type { PrintArea } from "./fourthwall-drops";
import { priceFor } from "./pricing";

const area = (type: string, extra: Partial<PrintArea> = {}): PrintArea => ({
  name: type,
  placements: [],
  required: false,
  salePrice: undefined,
  supportsBackendRendering: true,
  type,
  ...extra,
});

const TEE_AREAS = [
  area("front", {
    placements: [
      { id: "leftChest", name: "Left chest" },
      { id: "centerChest", name: "Center chest" },
    ],
  }),
  area("front_large"),
  area("back"),
  area("back_large", { salePrice: 8.5 }),
  area("neck_label", { salePrice: 2 }),
];

describe("chooseStyleFamily", () => {
  it("picks the family most tags point to and names them", () => {
    expect(
      chooseStyleFamily(["Skate punk", "Grunge revival", "Indie folk"])
    ).toEqual({
      family: "skate_punk",
      matched: ["Skate punk", "Grunge revival"],
    });
  });

  it("falls back to streetwear when no tag matches", () => {
    expect(chooseStyleFamily(["Quantum physics"])).toEqual({
      family: "streetwear",
      matched: [],
    });
  });

  it("changes the mix when the tags change", () => {
    const anime = DROP_MIX[chooseStyleFamily(["Anime", "JRPG"]).family];
    const folk = DROP_MIX[chooseStyleFamily(["Cottagecore"]).family];
    expect(anime).not.toEqual(folk);
  });
});

describe("DROP_MIX", () => {
  it("makes 4 to 6 products with one hero for every family", () => {
    for (const family of STYLE_FAMILIES) {
      const mix = DROP_MIX[family];
      expect(mix.length).toBeGreaterThanOrEqual(4);
      expect(mix.length).toBeLessThanOrEqual(6);
      expect(mix.some((kind) => PRODUCT_KINDS[kind].tier === "hero")).toBe(
        true
      );
    }
  });
});

describe("planPlacements", () => {
  it("puts a big back print and a left-chest mark on the hero tee", () => {
    const { missing, pieces } = planPlacements("hero_tee", TEE_AREAS);
    expect(missing).toEqual([]);
    expect(pieces.map((piece) => [piece.artType, piece.region])).toEqual([
      ["graphic", "back_large"],
      ["mark", "front"],
      ["label", "neck_label"],
    ]);
    const [back, chest] = pieces;
    expect(back?.offset).toEqual({ x: 0, y: -0.18 });
    expect(back?.pixels).toEqual({ height: 2400, width: 1800 });
    expect(chest?.placementId).toBe("leftChest");
    expect(chest?.pixels).toEqual({ height: 600, width: 600 });
    expect(chest?.offset).toBeUndefined();
  });

  it("never uses both sizes of one area", () => {
    const { pieces } = planPlacements("hero_tee", [
      area("back_large"),
      area("back"),
    ]);
    expect(pieces.map((piece) => piece.region)).toEqual(["back_large"]);
  });

  it("lists a required piece the blank can't print", () => {
    const { missing } = planPlacements("hero_tee", [area("back_large")]);
    expect(missing).toEqual(["mark"]);
  });

  it("drops a placement the area doesn't offer", () => {
    const { pieces } = planPlacements("long_sleeve", [area("front")]);
    expect(pieces[0]?.placementId).toBeUndefined();
  });

  it("finds a sleeve by part of its name", () => {
    const { pieces } = planPlacements("long_sleeve", [
      area("front"),
      area("left_sleeve_print"),
    ]);
    expect(pieces.map((piece) => piece.region)).toEqual([
      "front",
      "left_sleeve_print",
    ]);
  });

  it("covers a required area nothing took", () => {
    const { pieces } = planPlacements("poster", [
      area("print"),
      area("background", { required: true }),
    ]);
    expect(pieces.map((piece) => piece.region)).toEqual([
      "print",
      "background",
    ]);
  });

  it("prints posters and stickers at 300 DPI", () => {
    const { pieces } = planPlacements("sticker", [area("stickers")]);
    expect(pieces[0]?.pixels).toEqual({ height: 900, width: 900 });
  });
});

describe("pickColors", () => {
  const blank = ["Black", "White", "Navy Blazer", "Heather Gray"];

  it("matches the brief's colors to the blank's names", () => {
    expect(pickColors(blank, ["black", "navy", "pink"])).toEqual([
      "Black",
      "Navy Blazer",
    ]);
  });

  it("keeps the blank's first color when none matches", () => {
    expect(pickColors(blank, ["pink"])).toEqual(["Black"]);
  });

  it("caps the colors", () => {
    expect(pickColors(blank, ["black", "white", "navy", "gray"], 2)).toEqual([
      "Black",
      "White",
    ]);
  });
});

describe("pricing", () => {
  it("prices from the real cost in cents", () => {
    expect(priceFromCost(21.4)).toBe(priceFor(21.4) * 100);
  });

  it("adds each extra print area's price to the blank's", () => {
    expect(
      catalogCost(12, TEE_AREAS, ["back_large", "front", "neck_label"])
    ).toBe(12 + 2 + 8.5);
  });
});
