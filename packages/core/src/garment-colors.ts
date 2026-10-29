// The garment side of a brand palette: the colours a Fourthwall blank really
// comes in, and the ink (art) colours that stay readable on them.
//
// Fourthwall's catalog names a blank's colours ("Pepper", "Heather Grey")
// without hex values, so wovain keeps a table of the names it knows. A
// colour the table doesn't know is never offered: its contrast can't be
// checked. The model proposes a palette; this file decides what survives.

// The least luminance contrast between an ink colour and every garment
// colour it is printed on (WCAG 2's ratio; 3:1 is its bar for large text and
// graphics, a fair start for print).
export const MIN_INK_CONTRAST = 3;
export const MAX_GARMENTS = 3;
export const MIN_INKS = 2;
export const MAX_INKS = 5;

const HEX = /^#[\da-f]{6}$/iu;

// Fourthwall's colour filter names, plus the colour names the popular
// blanks (Bella+Canvas 3001, Comfort Colors 1717, Gildan, Cotton Heritage)
// list. Keys are lower case with single spaces.
const GARMENT_HEX: Readonly<Record<string, string>> = {
  "athletic heather": "#A8A9AD",
  banana: "#F4E285",
  "banana yellow": "#F6E27F",
  beige: "#D8C7A8",
  berry: "#8E3B5B",
  black: "#151515",
  "black heather": "#2B2B2B",
  "blue jean": "#5E7A99",
  "blue spruce": "#3E5C57",
  bubblegum: "#F5A3C7",
  burgundy: "#6D1F2F",
  butter: "#F3E3A1",
  "cantaloupe orange": "#F6A26B",
  "carnation pink": "#F2A7C3",
  "cayenne red": "#B5372B",
  chambray: "#9DB4CF",
  charcoal: "#3F3F44",
  "classic red": "#C8102E",
  "dark grey": "#4A4A4F",
  "dark grey heather": "#4F4F55",
  eggplant: "#4B2E4E",
  espresso: "#4A3226",
  "fern green": "#4F7942",
  "flora green": "#7BAE7F",
  forest: "#26412F",
  "forest green": "#26412F",
  grape: "#5E3A6E",
  graphite: "#4D4D50",
  gray: "#8E8E93",
  grey: "#8E8E93",
  "heather grey": "#B6B6B8",
  "heather navy": "#3A4458",
  "honeydew green": "#CDE7B0",
  "ice blue": "#C9DDE8",
  ivory: "#F2ECDD",
  "kelly green": "#2E8B57",
  khaki: "#B7A57A",
  lavender: "#C7B8E0",
  "lemon yellow": "#F7EA6B",
  "light blue": "#A9C7E3",
  lime: "#B5D95A",
  magenta: "#C2347A",
  "maraschino red": "#B0102A",
  maroon: "#5C1A26",
  "military green": "#5B5E3F",
  moss: "#6E7346",
  "moss green": "#6E7346",
  mustard: "#D1A33A",
  natural: "#EFE8D8",
  navy: "#1F2A44",
  orchid: "#B57EDC",
  "pale pink": "#F4D3D7",
  pepper: "#5A5754",
  plum: "#5B2C4F",
  red: "#C8102E",
  "royal blue": "#2B4C9B",
  sage: "#A3AE91",
  salmon: "#F08B7A",
  sand: "#D9C9A8",
  "sea foam": "#9FD8C6",
  "sky blue": "#8EC5E8",
  "soft cream": "#F3E9D2",
  "spindrift blue": "#A9D6E5",
  "spring green": "#7FD38A",
  "strawberry pink": "#E9739B",
  tangerine: "#F28C38",
  teal: "#2E7D7A",
  "true navy": "#1C2541",
  "true royal": "#2A4FA0",
  "tuna pink": "#E7A6A1",
  turquoise: "#3FB8AF",
  "vintage black": "#262626",
  "washed denim": "#7D93AD",
  watermelon: "#E35D6A",
  white: "#FFFFFF",
};

const keyOf = (name: string) =>
  name.trim().toLowerCase().replaceAll(/\s+/gu, " ");

// The hex of a garment colour Fourthwall names, or undefined when wovain
// doesn't know it.
export const garmentHex = (name: string): string | undefined =>
  GARMENT_HEX[keyOf(name)];

export interface GarmentColor {
  hex: string;
  // As the blank lists it.
  name: string;
}

// The blank's colours wovain can check contrast on, in the blank's order.
export const knownGarments = (colors: readonly string[]): GarmentColor[] => {
  const seen = new Set<string>();
  return colors.flatMap((name) => {
    const hex = garmentHex(name);
    const key = keyOf(name);
    if (hex === undefined || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [{ hex, name: name.trim() }];
  });
};

const channels = (hex: string) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const LINEAR_AT = 0.03928;
const linear = (channel: number) => {
  const value = channel / 255;
  return value <= LINEAR_AT ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

// WCAG 2 relative luminance, 0 (black) to 1 (white).
export const luminance = (hex: string) => {
  const [red = 0, green = 0, blue = 0] = channels(hex).map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

// WCAG 2 contrast ratio, 1 to 21.
export const contrastRatio = (first: string, second: string) => {
  const [light, dark] = [luminance(first), luminance(second)].toSorted(
    (a, b) => b - a
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

const toHex = (values: number[]) =>
  `#${values
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`.toUpperCase();

// The colour moved `share` of the way toward white or black.
const mix = (hex: string, toward: "black" | "white", share: number) => {
  const target = toward === "white" ? 255 : 0;
  return toHex(
    channels(hex).map((channel) => channel + (target - channel) * share)
  );
};

const passes = (ink: string, garments: readonly GarmentColor[]) =>
  garments.every(
    (garment) => contrastRatio(ink, garment.hex) >= MIN_INK_CONTRAST
  );

const ADJUST_STEPS = [0.15, 0.3, 0.45, 0.6];

// The ink as given when it reads on every garment, else the smallest shift
// toward white or black that does, else undefined.
export const readableInk = (
  ink: string,
  garments: readonly GarmentColor[]
): string | undefined => {
  if (passes(ink, garments)) {
    return ink.toUpperCase();
  }
  // Light garments want darker ink and dark garments lighter ink; try the
  // direction that moves away from the garments' average first.
  const average =
    garments.reduce((sum, garment) => sum + luminance(garment.hex), 0) /
    Math.max(1, garments.length);
  const first = luminance(ink) >= average ? "white" : "black";
  const second = first === "white" ? "black" : "white";
  for (const toward of [first, second] as const) {
    for (const share of ADJUST_STEPS) {
      const moved = mix(ink, toward, share);
      if (passes(moved, garments)) {
        return moved;
      }
    }
  }
  return undefined;
};

export interface PaletteProposal {
  // Garment colour names, as the model picked them from the offered list.
  garments: readonly string[];
  inks: readonly string[];
}

export interface FittedPalette {
  // Inks moved to pass contrast (original to adjusted).
  adjusted: { from: string; to: string }[];
  // Inks no shift could make readable.
  dropped: string[];
  garments: GarmentColor[];
  inks: string[];
  // Garment names that the blank doesn't offer, or wovain doesn't know.
  refused: string[];
}

// The proposal held to the blank: garments only from the blank's known
// colours (1 to 3), inks readable on every one of them (2 to 5). Undefined
// when too little survives to make a palette.
export const fitPalette = (
  proposal: PaletteProposal,
  offered: readonly GarmentColor[]
): FittedPalette | undefined => {
  const byKey = new Map(
    offered.map((garment) => [keyOf(garment.name), garment])
  );
  const refused: string[] = [];
  const garments: GarmentColor[] = [];
  for (const name of proposal.garments) {
    const garment = byKey.get(keyOf(name));
    if (garment === undefined) {
      refused.push(name);
    } else if (!garments.includes(garment) && garments.length < MAX_GARMENTS) {
      garments.push(garment);
    }
  }
  if (garments.length === 0) {
    return undefined;
  }
  const adjusted: FittedPalette["adjusted"] = [];
  const dropped: string[] = [];
  const inks: string[] = [];
  for (const ink of proposal.inks) {
    if (!HEX.test(ink)) {
      dropped.push(ink);
      continue;
    }
    const readable = readableInk(ink, garments);
    if (readable === undefined) {
      dropped.push(ink);
    } else if (!inks.includes(readable) && inks.length < MAX_INKS) {
      if (readable !== ink.toUpperCase()) {
        adjusted.push({ from: ink.toUpperCase(), to: readable });
      }
      inks.push(readable);
    }
  }
  return inks.length < MIN_INKS
    ? undefined
    : { adjusted, dropped, garments, inks, refused };
};
