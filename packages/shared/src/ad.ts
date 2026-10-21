import { z } from "zod";

// Everything the ad widget shows (prd.md > Ad widgets). Copy and videos come from
// the ads playbook; economics and rules are computed by the server from the
// design's price, so the money numbers never come from the model.

export const adSlotSchema = z.enum(["A", "B"]);
export type AdSlot = z.infer<typeof adSlotSchema>;

export const adVideoSchema = z.object({
  // What the clip shows, for example "UGC on-model".
  angle: z.string().min(1).max(60),
  seconds: z.number().positive(),
  slot: adSlotSchema,
  status: z.enum(["ready", "failed"]),
  url: z.url().optional(),
});
export type AdVideo = z.infer<typeof adVideoSchema>;

export const adStatusSchema = z.enum(["draft", "added", "skipped"]);
export type AdStatus = z.infer<typeof adStatusSchema>;

export const adSchema = z.object({
  coach: z.string().min(1).max(160),
  designId: z.string().regex(/^d\d+$/u),
  economics: z.object({
    baseCost: z.number(),
    breakevenPerSale: z.number(),
    cardFees: z.number(),
    price: z.number(),
    refundReserve: z.number(),
    roas: z.number(),
    roasOnOrderValue: z.number(),
  }),
  headline: z.string().min(1).max(60),
  primaryText: z.string().min(1).max(500),
  productTitle: z.string().min(1),
  rules: z.object({
    alertAbove: z.number(),
    killDesignAt: z.number(),
    killExpensiveAbove: z.number(),
    killNoSalesAt: z.number(),
    scaleStepPct: z.number(),
    scaleUnder: z.number(),
  }),
  staticImage: z.object({ alt: z.string().min(1), url: z.url() }),
  status: adStatusSchema.default("draft"),
  videos: z.array(adVideoSchema).min(1).max(4),
});
export type Ad = z.infer<typeof adSchema>;

export const adResultSchema = z.object({ ad: adSchema });
