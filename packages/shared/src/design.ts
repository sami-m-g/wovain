import { z } from "zod";

import { sizeCostSchema } from "./economics.ts";

// Everything the design widget shows (prd.md > Design widgets), shared by the
// server tools that write it and the widget that renders it. A design is one
// idea: its hero product plus the rest of the drop (`range`).

export const designStatusSchema = z.enum([
  "draft",
  "publishing",
  "live",
  "rejected",
  "skipped",
]);
export type DesignStatus = z.infer<typeof designStatusSchema>;

const quoteSchema = z.object({
  baseCost: z.number(),
  breakevenPerSale: z.number(),
  cardFees: z.number(),
  marginPct: z.number(),
  price: z.number(),
  profit: z.number(),
  refundReserve: z.number(),
  roas: z.number(),
});
export type DesignQuote = z.infer<typeof quoteSchema>;

const artworkSchema = z.object({
  // Fourthwall's minimum for the chosen print size (prd.md > States #4).
  requiredPx: z.int().positive(),
  transparent: z.boolean(),
  url: z.url(),
  widthPx: z.int().positive(),
});
type Artwork = z.infer<typeof artworkSchema>;

const placementSchema = z.object({
  area: z.string(),
  printSize: z.string(),
  style: z.string(),
});

// Fields every product in a drop has, the hero included.
const productFields = {
  artwork: artworkSchema,
  blank: z.object({
    badge: z.string().optional(),
    catalogProductId: z.string(),
    name: z.string(),
    rating: z.number().min(0).max(5).optional(),
  }),
  colors: z
    .array(
      z.object({
        hex: z.string().regex(/^#[0-9a-f]{6}$/iu),
        inStock: z.boolean(),
        name: z.string(),
      })
    )
    .min(1),
  // From generate-product-design-previews; Approve creates the product from it.
  customizationId: z.string().min(1),
  // More prints on the same product, each with its own art: a back print, a
  // sleeve mark, a pocket logo.
  extraPlacements: z
    .array(placementSchema.extend({ artwork: artworkSchema }))
    .max(4)
    .default([]),
  listing: z.object({
    description: z.string().min(1).max(300),
    title: z.string().min(1).max(120),
  }),
  mockups: z
    .array(
      z.object({ alt: z.string().min(1), color: z.string(), url: z.url() })
    )
    .min(1),
  placement: placementSchema,
  quote: quoteSchema,
  sizes: z.array(sizeCostSchema.extend({ inStock: z.boolean() })).min(1),
};

// One more product in the drop: a hoodie, a mug, a sticker…
export const rangeProductSchema = z.object({
  ...productFields,
  // The product type in a word or two, for the widget ("Hoodie", "Mug").
  kind: z.string().min(1).max(40),
  offerId: z.string().optional(),
  productUrl: z.url().optional(),
});
export type RangeProduct = z.infer<typeof rangeProductSchema>;

// Fourthwall's get-offers-by-ids takes 10 ids; the hero is one of them.
export const MAX_RANGE = 7;

export const designSchema = z.object({
  ...productFields,
  coach: z.string().min(1).max(160),
  // The Fourthwall collection that groups a drop once it's published.
  collectionId: z.string().optional(),
  // The drop's name on Fourthwall; the idea when omitted.
  dropName: z.string().min(1).max(80).optional(),
  id: z.string().regex(/^d\d+$/u),
  idea: z.string().min(1),
  productId: z.string().optional(),
  // The hero product's page, or the collection's for a drop.
  productUrl: z.url().optional(),
  range: z.array(rangeProductSchema).max(MAX_RANGE).default([]),
  rejectCount: z.int().min(0).default(0),
  rejectReason: z.string().optional(),
  status: designStatusSchema.default("draft"),
});
export type Design = z.infer<typeof designSchema>;

export const designResultSchema = z.object({ design: designSchema });
export const quoteResultSchema = z.object({ quote: quoteSchema });

// Print quality the widget shows next to the artwork's pixel width.
export const printQuality = (artwork: Artwork) =>
  artwork.widthPx >= artwork.requiredPx ? "high" : "low";

// Every product in the drop, the hero first.
const dropProducts = (design: Design) => [design, ...design.range];

// Each print in the drop that would come out blurry, named for the widget.
export const lowPrints = (design: Design) =>
  dropProducts(design).flatMap((product) =>
    [
      { area: product.placement.area, artwork: product.artwork },
      ...product.extraPlacements,
    ].flatMap(({ area, artwork }) =>
      printQuality(artwork) === "low"
        ? [{ area, artwork, product: product.blank.name }]
        : []
    )
  );

// One of each product in the drop: what a fan buying the set pays, and what
// the merchant keeps.
export const dropTotals = (design: Design) => {
  const products = dropProducts(design);
  const price = products.reduce((sum, item) => sum + item.quote.price, 0);
  const profit = products.reduce((sum, item) => sum + item.quote.profit, 0);
  return {
    count: products.length,
    marginPct: price > 0 ? (profit / price) * 100 : 0,
    price,
    profit,
  };
};
