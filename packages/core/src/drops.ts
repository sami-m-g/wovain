import type { PrintArea } from "./fourthwall-drops";
import { priceFor } from "./pricing";

// A drop is a capsule of 4 to 6 products that share one palette, one mark
// and one style family (openspec design-drops). Qloo's audience tags pick
// the style family; the family picks the product mix; each product kind has
// a placement plan (what art goes where, at what size); and each placement
// gets art of the type its print method needs. Everything here is code:
// the same tags always make the same plan, and the plan says why.

export const ART_TYPES = [
  // An illustration on a transparent background: the statement back print.
  "graphic",
  // A small logo or monogram: the chest mark, stickers, mugs.
  "mark",
  // Words only: sleeve text, wordmarks.
  "typographic",
  // A seamless tile for all-over print.
  "pattern",
  // A flat mark in at most 6 thread colors.
  "embroidery",
  // The neck label: brand name, drawn in code, no AI.
  "label",
] as const;
export type ArtType = (typeof ART_TYPES)[number];

// How Fourthwall makes it, and the resolution it needs at print size.
export const PRINT_METHODS = {
  all_over: { dpi: 150 },
  dtg: { dpi: 150 },
  embroidery: { dpi: 150 },
  printed: { dpi: 300 },
  sticker: { dpi: 300 },
} as const;
export type PrintMethod = keyof typeof PRINT_METHODS;

// At most this many thread colors in an embroidered mark (Fourthwall's
// embroidery guide).
export const MAX_THREAD_COLORS = 6;

export const STYLE_FAMILIES = [
  "skate_punk",
  "indie_folk",
  "anime_gaming",
  "quiet_luxury",
  "sports_varsity",
  "streetwear",
] as const;
export type StyleFamily = (typeof STYLE_FAMILIES)[number];

// Words in a Qloo tag (or a brand niche) that point to a style family.
const FAMILY_WORDS: Record<Exclude<StyleFamily, "streetwear">, string[]> = {
  anime_gaming: [
    "anime",
    "manga",
    "gaming",
    "video game",
    "jrpg",
    "kawaii",
    "cosplay",
    "esports",
    "pixel",
    "j-pop",
    "jpop",
    "k-pop",
    "kpop",
  ],
  indie_folk: [
    "folk",
    "indie",
    "cottagecore",
    "acoustic",
    "singer-songwriter",
    "nature",
    "botanical",
    "vintage",
    "craft",
    "americana",
  ],
  quiet_luxury: [
    "minimal",
    "luxury",
    "classic",
    "jazz",
    "ambient",
    "elegant",
    "designer",
    "fashion",
    "art house",
    "arthouse",
  ],
  skate_punk: [
    "skate",
    "punk",
    "grunge",
    "metal",
    "hardcore",
    "diy",
    "emo",
    "garage",
    "rock",
    "underground",
  ],
  sports_varsity: [
    "sport",
    "football",
    "soccer",
    "basketball",
    "baseball",
    "varsity",
    "college",
    "athletic",
    "fitness",
    "running",
  ],
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[_\s]+/gu, " ")
    .trim();

export interface FamilyChoice {
  family: StyleFamily;
  // The tags that voted for it; empty when nothing matched.
  matched: string[];
}

// The style family most of the tags point to; streetwear when none does.
// Ties go to the family listed first in STYLE_FAMILIES.
export const chooseStyleFamily = (tags: readonly string[]): FamilyChoice => {
  let best: FamilyChoice = { family: "streetwear", matched: [] };
  for (const family of STYLE_FAMILIES) {
    if (family === "streetwear") {
      continue;
    }
    const words = FAMILY_WORDS[family];
    const matched = tags.filter((tag) => {
      const text = normalize(tag);
      return words.some((word) => text.includes(word));
    });
    if (matched.length > best.matched.length) {
      best = { family, matched };
    }
  }
  return best;
};

// One piece of art on a product: what kind, where, and how big.
export interface PieceSpec {
  artType: ArtType;
  // Region types in order of preference; a name matches a region type
  // equal to it, then one that contains it ("sleeve" finds
  // "left_sleeve"). "*" is the first region nothing else took.
  regions: readonly string[];
  placementId?: string | undefined;
  // Size as a fraction of the region (or the placement).
  fraction: number;
  // Moves the art's centre, as a fraction of the region: y = -0.18 sits
  // high on the back. The art's canvas spans fraction/2 each side of its
  // centre, so fraction + 2 * |offset| must stay at most 1, or the edge
  // falls outside the print area.
  offset?: { x: number; y: number } | undefined;
  // Fill every spot the region prints (both sides of a mug).
  fillAll?: boolean | undefined;
  // A piece the product can do without when the blank lacks the region.
  optional?: boolean | undefined;
}

export interface KindSpec {
  label: string;
  // The catalog search for a blank.
  query: string;
  productionMethods?: readonly string[] | undefined;
  printRegions?: readonly string[] | undefined;
  method: PrintMethod;
  tier: "hero" | "support" | "headwear" | "low_ticket";
  pieces: readonly PieceSpec[];
}

const BACK_STATEMENT: PieceSpec = {
  artType: "graphic",
  // 0.64 + 2 * 0.18 = 1: the top edge meets the region's top edge.
  fraction: 0.64,
  offset: { x: 0, y: -0.18 },
  regions: ["back_large", "back"],
};
const CHEST_MARK: PieceSpec = {
  artType: "mark",
  fraction: 1,
  placementId: "leftChest",
  regions: ["front"],
};
const NECK_LABEL: PieceSpec = {
  artType: "label",
  fraction: 1,
  optional: true,
  regions: ["neck_label", "inside_label", "label"],
};

export const PRODUCT_KINDS = {
  aop_crew: {
    label: "All-over print crewneck",
    method: "all_over",
    pieces: [
      { artType: "pattern", fillAll: true, fraction: 1, regions: ["*"] },
    ],
    productionMethods: ["ALL_OVER_PRINT"],
    query: "all over print sweatshirt",
    tier: "support",
  },
  beanie: {
    label: "Embroidered beanie",
    method: "embroidery",
    pieces: [{ artType: "embroidery", fraction: 1, regions: ["front", "*"] }],
    productionMethods: ["EMBROIDERY"],
    query: "beanie",
    tier: "headwear",
  },
  dad_hat: {
    label: "Embroidered dad hat",
    method: "embroidery",
    pieces: [{ artType: "embroidery", fraction: 1, regions: ["front", "*"] }],
    productionMethods: ["EMBROIDERY"],
    query: "dad hat",
    tier: "headwear",
  },
  embroidered_crew: {
    label: "Embroidered crewneck",
    method: "embroidery",
    pieces: [
      {
        artType: "embroidery",
        fraction: 1,
        placementId: "leftChest",
        regions: ["front", "*"],
      },
    ],
    productionMethods: ["EMBROIDERY"],
    query: "crewneck",
    tier: "support",
  },
  hero_hoodie: {
    label: "Hoodie",
    method: "dtg",
    pieces: [BACK_STATEMENT, CHEST_MARK, NECK_LABEL],
    printRegions: ["Front", "Back"],
    productionMethods: ["DTG"],
    query: "hoodie",
    tier: "hero",
  },
  hero_tee: {
    label: "Heavyweight tee",
    method: "dtg",
    pieces: [BACK_STATEMENT, CHEST_MARK, NECK_LABEL],
    printRegions: ["Front", "Back"],
    productionMethods: ["DTG"],
    query: "heavyweight t-shirt",
    tier: "hero",
  },
  long_sleeve: {
    label: "Long-sleeve tee",
    method: "dtg",
    pieces: [
      CHEST_MARK,
      {
        artType: "typographic",
        fraction: 0.9,
        optional: true,
        regions: ["left_sleeve", "sleeve"],
      },
      NECK_LABEL,
    ],
    productionMethods: ["DTG"],
    query: "long sleeve t-shirt",
    tier: "support",
  },
  mug: {
    label: "Mug",
    method: "printed",
    pieces: [{ artType: "mark", fillAll: true, fraction: 0.8, regions: ["*"] }],
    productionMethods: ["DRINKWARE"],
    query: "mug",
    tier: "low_ticket",
  },
  poster: {
    label: "Poster",
    method: "printed",
    pieces: [{ artType: "graphic", fraction: 0.9, regions: ["*"] }],
    productionMethods: ["PRINTED"],
    query: "poster",
    tier: "low_ticket",
  },
  sticker: {
    label: "Die-cut sticker",
    method: "sticker",
    pieces: [{ artType: "mark", fillAll: true, fraction: 1, regions: ["*"] }],
    productionMethods: ["STICKER"],
    query: "die cut sticker",
    tier: "low_ticket",
  },
  tote: {
    label: "Tote bag",
    method: "dtg",
    pieces: [{ artType: "graphic", fraction: 0.85, regions: ["front", "*"] }],
    query: "tote bag",
    tier: "low_ticket",
  },
} as const satisfies Record<string, KindSpec>;
export type ProductKind = keyof typeof PRODUCT_KINDS;
export const PRODUCT_KIND_IDS = Object.keys(PRODUCT_KINDS) as ProductKind[];

// What each family makes: one hero, supports, headwear and low-ticket
// add-ons, 4 to 6 products (POD drop research, design-quality.md §4).
export const DROP_MIX: Record<StyleFamily, readonly ProductKind[]> = {
  anime_gaming: ["hero_tee", "aop_crew", "poster", "sticker"],
  indie_folk: ["hero_tee", "embroidered_crew", "tote", "poster"],
  quiet_luxury: ["hero_hoodie", "embroidered_crew", "dad_hat", "tote"],
  skate_punk: ["hero_tee", "long_sleeve", "beanie", "sticker"],
  sports_varsity: ["hero_tee", "long_sleeve", "dad_hat", "sticker"],
  streetwear: ["hero_hoodie", "hero_tee", "long_sleeve", "dad_hat", "sticker"],
};

// Print size in inches by region type (a heuristic; Fourthwall gives no
// sizes in the catalog). Placements override the region's size.
const REGION_INCHES: Record<string, { h: number; w: number }> = {
  back: { h: 12, w: 10 },
  back_large: { h: 16, w: 12 },
  front: { h: 12, w: 10 },
  front_large: { h: 16, w: 12 },
  label: { h: 3, w: 3 },
  sleeve: { h: 12, w: 3 },
};
const PLACEMENT_INCHES: Record<string, { h: number; w: number }> = {
  centerChest: { h: 8, w: 8 },
  leftChest: { h: 4, w: 4 },
};
const KIND_INCHES: Partial<Record<ProductKind, { h: number; w: number }>> = {
  aop_crew: { h: 28, w: 20 },
  beanie: { h: 1.75, w: 5 },
  dad_hat: { h: 2, w: 4 },
  embroidered_crew: { h: 4, w: 4 },
  mug: { h: 3.5, w: 8.5 },
  poster: { h: 18, w: 12 },
  sticker: { h: 3, w: 3 },
  tote: { h: 12, w: 12 },
};

export const printInches = (
  kind: ProductKind,
  region: string,
  placementId?: string
): { h: number; w: number } => {
  if (placementId !== undefined && PLACEMENT_INCHES[placementId]) {
    return PLACEMENT_INCHES[placementId];
  }
  const own = KIND_INCHES[kind];
  if (own !== undefined) {
    return own;
  }
  const type = region.toLowerCase();
  const key = Object.keys(REGION_INCHES)
    .toSorted((a, b) => b.length - a.length)
    .find((name) => type === name || type.includes(name));
  return REGION_INCHES[key ?? "front"] ?? { h: 12, w: 10 };
};

// A piece resolved on a real blank.
export interface PlacedPiece {
  artType: ArtType;
  fillAll?: boolean | undefined;
  fraction: number;
  method: PrintMethod;
  offset?: { x: number; y: number } | undefined;
  placementId?: string | undefined;
  // Pixels the art needs at its print size and the method's DPI.
  pixels: { height: number; width: number };
  printInches: { h: number; w: number };
  region: string;
}

// front and front_large (back and back_large) print on the same area:
// Fourthwall refuses both in one design.
const areaOf = (type: string) => type.replace(/_large$/u, "");

const matchRegion = (
  wanted: string,
  areas: readonly PrintArea[],
  taken: ReadonlySet<string>
) => {
  const free = areas.filter((area) => !taken.has(areaOf(area.type)));
  if (wanted === "*") {
    return free[0];
  }
  return (
    free.find((area) => area.type === wanted) ??
    free.find((area) => area.type.includes(wanted))
  );
};

const pixelsFor = (inches: { h: number; w: number }, method: PrintMethod) => ({
  height: Math.ceil(inches.h * PRINT_METHODS[method].dpi),
  width: Math.ceil(inches.w * PRINT_METHODS[method].dpi),
});

export interface Placement {
  missing: ArtType[];
  pieces: PlacedPiece[];
}

// The kind's pieces on this blank's print areas. A placement the area
// doesn't offer is dropped (the art sits at the region's default spot). A
// required area nothing took gets the first piece's art, so Fourthwall can
// make the product. `missing` lists the required pieces with no region.
export const planPlacements = (
  kind: ProductKind,
  areas: readonly PrintArea[]
): Placement => {
  const spec: KindSpec = PRODUCT_KINDS[kind];
  const taken = new Set<string>();
  const pieces: PlacedPiece[] = [];
  const missing: ArtType[] = [];
  for (const piece of spec.pieces) {
    const area = piece.regions
      .map((wanted) => matchRegion(wanted, areas, taken))
      .find((found) => found !== undefined);
    if (area === undefined) {
      if (piece.optional !== true) {
        missing.push(piece.artType);
      }
      continue;
    }
    taken.add(areaOf(area.type));
    const offered = (area.placements ?? []).some(
      (placement) => placement.id === piece.placementId
    );
    const placementId = offered ? piece.placementId : undefined;
    const inches = printInches(kind, area.type, placementId);
    pieces.push({
      artType: piece.artType,
      fillAll: piece.fillAll,
      fraction: piece.fraction,
      method: spec.method,
      offset: placementId === undefined ? piece.offset : undefined,
      pixels: pixelsFor(inches, spec.method),
      placementId,
      printInches: inches,
      region: area.type,
    });
  }
  const [first] = pieces;
  for (const area of areas) {
    if (area.required === true && !taken.has(areaOf(area.type)) && first) {
      taken.add(areaOf(area.type));
      const inches = printInches(kind, area.type);
      pieces.push({
        ...first,
        offset: undefined,
        pixels: pixelsFor(inches, spec.method),
        placementId: undefined,
        printInches: inches,
        region: area.type,
      });
    }
  }
  return { missing, pieces };
};

const MAX_COLORS = 4;

// The blank's colors that match the brief's garment colors ("black" finds
// "Black", "navy" finds "Navy Blazer"), up to four. When none matches, the
// blank's first color, so the product still sells in one.
export const pickColors = (
  blankColors: readonly string[],
  wanted: readonly string[],
  max = MAX_COLORS
): string[] => {
  const picked: string[] = [];
  for (const color of wanted) {
    const key = normalize(color);
    const found =
      blankColors.find((blank) => normalize(blank) === key) ??
      blankColors.find((blank) => normalize(blank).includes(key));
    if (found !== undefined && !picked.includes(found)) {
      picked.push(found);
    }
  }
  if (picked.length === 0 && blankColors[0] !== undefined) {
    picked.push(blankColors[0]);
  }
  return picked.slice(0, max);
};

const CENTS = 100;

// The price from what Fourthwall charges to make the product (the blank
// plus every print area), through the pricing rules; integer cents.
export const priceFromCost = (costDollars: number) =>
  Math.round(priceFor(costDollars) * CENTS);

// The fallback when Fourthwall's pricing can't be read: the blank's price
// plus each extra area's own price. The first area is in the blank's.
export const catalogCost = (
  baseCost: number,
  areas: readonly PrintArea[],
  regions: readonly string[]
) => {
  const used = areas
    .filter((area) => regions.includes(area.type))
    .map((area) => area.salePrice ?? 0)
    .toSorted((a, b) => a - b);
  return baseCost + used.slice(1).reduce((sum, price) => sum + price, 0);
};
