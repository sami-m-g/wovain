import { z } from "zod";

import { quoteSchema, sizeCostSchema } from "./economics.ts";

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

// A drop is the hero plus up to 7 products: 8 offers, within the 10 ids
// Fourthwall's get-offers-by-ids reads in one call.
export const MAX_RANGE = 7;

// The merchant's approval, confirmed in their browser after signing in to
// wovain, tied to the exact content approved (a hash of every product's
// customization, price and listing). Publishing claims it, so two publishes
// can't run at once.
const approvalSchema = z.object({
  at: z.iso.datetime(),
  claimedAt: z.iso.datetime().optional(),
  hash: z.string().min(1),
  // Set when autopilot approved it in this run (the merchant opted in on
  // wovain's confirm page): the products publish hidden.
  run: z.string().optional(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const designSchema = z.object({
  ...productFields,
  approval: approvalSchema.optional(),
  coach: z.string().min(1).max(160),
  // The Fourthwall collection that groups a drop once it's published.
  collectionId: z.string().optional(),
  // The drop's name on Fourthwall; the idea when omitted.
  dropName: z.string().min(1).max(80).optional(),
  // Created on Fourthwall but hidden from shoppers: autopilot made it, and
  // the merchant's confirmed launch makes it public.
  hidden: z.boolean().optional(),
  id: z.string().regex(/^d\d+$/u),
  idea: z.string().min(1),
  productId: z.string().optional(),
  // The hero product's page, or the collection's for a drop.
  productUrl: z.url().optional(),
  range: z.array(rangeProductSchema).max(MAX_RANGE).default([]),
  rejectCount: z.int().min(0).default(0),
  rejectReason: z.string().optional(),
  // The autopilot run that was running when the design was made: only that
  // run may decide it.
  run: z.string().optional(),
  status: designStatusSchema.default("draft"),
});
export type Design = z.infer<typeof designSchema>;

export const designResultSchema = z.object({ design: designSchema });
export const quoteResultSchema = z.object({ quote: quoteSchema });

// Print quality the widget shows next to the artwork's pixel width.
export const printQuality = (artwork: Artwork) =>
  artwork.widthPx >= artwork.requiredPx ? "high" : "low";

// Every product in the drop, the hero first.
export const dropProducts = (design: Design) => [design, ...design.range];

// Every print on a product, its main placement first.
export const printsOf = (product: Design | RangeProduct) => [
  { ...product.placement, artwork: product.artwork, main: true },
  ...product.extraPlacements.map((item) => ({ ...item, main: false })),
];

// Each print in the drop that would come out blurry, named for the widget.
// `hero` marks the hero's main print, which the widget reports on its own.
export const lowPrints = (design: Design) =>
  dropProducts(design).flatMap((product, index) =>
    printsOf(product).flatMap(({ area, artwork, main }) =>
      printQuality(artwork) === "low"
        ? [{ area, hero: index === 0 && main, product: product.blank.name }]
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

// Staged artwork: the bytes live in media under `key`, the record in Firestore.
export const stagedArtworkSchema = z.object({
  bytes: z.int().positive(),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  height: z.int().positive(),
  id: z.string().regex(/^a\d+$/u),
  key: z.string(),
  // Absent for data URLs, which have no public URL.
  sourceUrl: z.url().optional(),
  transparent: z.boolean(),
  width: z.int().positive(),
});
export type StagedArtwork = z.infer<typeof stagedArtworkSchema>;
