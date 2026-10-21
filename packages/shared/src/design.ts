import { z } from "zod";

import { sizeCostSchema } from "./economics.ts";

// Everything the design widget shows (prd.md > Design widgets), shared by the
// server tools that write it and the widget that renders it.

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

export const designSchema = z.object({
  artwork: z.object({
    // Fourthwall's minimum for the chosen print size (prd.md > States #4).
    requiredPx: z.int().positive(),
    transparent: z.boolean(),
    url: z.url(),
    widthPx: z.int().positive(),
  }),
  blank: z.object({
    badge: z.string().optional(),
    catalogProductId: z.string(),
    name: z.string(),
    rating: z.number().min(0).max(5).optional(),
  }),
  coach: z.string().min(1).max(160),
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
  id: z.string().regex(/^d\d+$/u),
  idea: z.string().min(1),
  listing: z.object({
    description: z.string().min(1).max(300),
    title: z.string().min(1).max(120),
  }),
  mockups: z
    .array(
      z.object({ alt: z.string().min(1), color: z.string(), url: z.url() })
    )
    .min(1),
  placement: z.object({
    area: z.string(),
    printSize: z.string(),
    style: z.string(),
  }),
  productId: z.string().optional(),
  productUrl: z.url().optional(),
  quote: quoteSchema,
  rejectCount: z.int().min(0).default(0),
  rejectReason: z.string().optional(),
  sizes: z.array(sizeCostSchema.extend({ inStock: z.boolean() })).min(1),
  status: designStatusSchema.default("draft"),
});
export type Design = z.infer<typeof designSchema>;

export const designResultSchema = z.object({ design: designSchema });
export const quoteResultSchema = z.object({ quote: quoteSchema });

// Print quality the widget shows next to the artwork's pixel width.
export const printQuality = (artwork: Design["artwork"]) =>
  artwork.widthPx >= artwork.requiredPx ? "high" : "low";
