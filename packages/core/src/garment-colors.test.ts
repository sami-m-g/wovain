import { expect, it } from "vitest";

import {
  MIN_INK_CONTRAST,
  blankGarments,
  contrastRatio,
  fitPalette,
  knownGarments,
} from "./garment-colors";

// A Comfort Colors 1717 tee's colours, as Fourthwall lists them; "Watermelon
// Swirl" is a colour wovain has no hex for.
const comfortColors = knownGarments([
  "Pepper",
  "Ivory",
  "Sage",
  "Watermelon Swirl",
]);

it("knows only the blank's colours it can check", () => {
  expect(comfortColors.map((color) => color.name)).toStrictEqual([
    "Pepper",
    "Ivory",
    "Sage",
  ]);
});

it("measures contrast as WCAG does", () => {
  expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
});

it("fixes an ink that disappears on the chosen garment", () => {
  // Pale butter on Ivory is unreadable; dark brown reads.
  const fitted = fitPalette(
    { garments: ["Ivory"], inks: ["#F3E3A1", "#3B2A20"] },
    comfortColors
  );
  expect(fitted).toBeDefined();
  for (const ink of fitted?.inks ?? []) {
    expect(contrastRatio(ink, "#F2ECDD")).toBeGreaterThanOrEqual(
      MIN_INK_CONTRAST
    );
  }
  expect(fitted?.adjusted.map((one) => one.from)).toContain("#F3E3A1");
  expect(fitted?.inks).toContain("#3B2A20");
});

it("never suggests a garment colour the blank doesn't offer", () => {
  const fitted = fitPalette(
    {
      garments: ["Navy", "Pepper", "Watermelon Swirl"],
      inks: ["#F2ECDD", "#E8C07D"],
    },
    comfortColors
  );
  expect(fitted?.garments.map((garment) => garment.name)).toStrictEqual([
    "Pepper",
  ]);
  expect(fitted?.refused).toStrictEqual(["Navy", "Watermelon Swirl"]);
});

it("gives no palette when no offered garment is left", () => {
  expect(
    fitPalette(
      { garments: ["Navy"], inks: ["#FFFFFF", "#EEEEEE"] },
      comfortColors
    )
  ).toBeUndefined();
});

it("drops inks that can't read on both a light and a dark garment", () => {
  const fitted = fitPalette(
    { garments: ["Pepper", "Ivory"], inks: ["#808080", "#FFFFFF", "#111111"] },
    comfortColors
  );
  // Mid grey moved toward white still fails on Ivory; nothing reads on both.
  expect(fitted).toBeUndefined();
});

// A blank's colours, spelled as Fourthwall lists them.
const blank = ["Black", "Pepper", "Ivory", "Navy"];

it("keeps a palette colour the blank offers, spelled as the blank lists it", () => {
  expect(blankGarments(["black", "ivory"], blank)).toEqual(["Black", "Ivory"]);
});

it("maps a palette colour the blank lacks to its nearest colour", () => {
  // Natural is closest to Ivory, Charcoal to Pepper (CIEDE2000).
  expect(blankGarments(["Natural", "Charcoal"], blank)).toEqual([
    "Ivory",
    "Pepper",
  ]);
});

it("uses the blank's own first colour when no palette colour can be matched", () => {
  expect(blankGarments(["Watermelon Swirl"], blank)).toEqual(["Black"]);
  expect(blankGarments([], blank)).toEqual(["Black"]);
});
