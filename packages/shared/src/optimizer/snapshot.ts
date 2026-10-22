import { z } from "zod";

// One day's normalized rows per source (spec section 3, Observe). Every row
// keeps where it came from, so no number from one source is read as another's.
// Times are epoch milliseconds.

export const evidenceSources = [
  "fourthwall",
  "meta",
  "trends",
  "wovain",
  "computed",
] as const;
export const evidenceSourceSchema = z.enum(evidenceSources);

// A sale on Fourthwall, attributed to an ad by `utm_content`.
export const orderRowSchema = z.object({
  adId: z.string().optional(),
  at: z.int(),
  customerKey: z.string().optional(),
  designId: z.string().optional(),
  orderId: z.string(),
  productId: z.string(),
  revenue: z.number().min(0),
  size: z.string().optional(),
  units: z.int().min(1),
  utmSource: z.string().optional(),
  variantId: z.string().optional(),
});
export type OrderRow = z.infer<typeof orderRowSchema>;

// A refund, cancellation or chargeback reverses a sale; `cost` is what the
// merchant still pays on it (fees, a printed blank).
export const reversalRowSchema = z.object({
  at: z.int(),
  cost: z.number().min(0).default(0),
  kind: z.enum(["refund", "cancellation", "chargeback"]),
  orderId: z.string(),
  reason: z.string().max(500).optional(),
});
export type ReversalRow = z.infer<typeof reversalRowSchema>;

export const fulfillmentRowSchema = z.object({
  // Set once the shipping address changed after the order shipped.
  addressChangedAfterShipping: z.boolean().default(false),
  orderId: z.string(),
  productId: z.string(),
  // A fulfillment Fourthwall skipped or cancelled (a production error).
  productionError: z.boolean().default(false),
  since: z.int(),
  status: z.string(),
});
export type FulfillmentRow = z.infer<typeof fulfillmentRowSchema>;

export const stockRowSchema = z.object({
  at: z.int(),
  color: z.string().optional(),
  productId: z.string(),
  size: z.string().optional(),
  state: z.enum(["in_stock", "out_of_stock", "discontinued"]),
  variantId: z.string().optional(),
});
export type StockRow = z.infer<typeof stockRowSchema>;

// Meta's numbers for one ad on one day (a signal next to Fourthwall's sales).
export const adDayRowSchema = z.object({
  adId: z.string(),
  // When Meta reported it; younger than conversionLagHours is unsettled.
  at: z.int(),
  clicks: z.int().min(0),
  date: z.iso.date(),
  frequency: z.number().min(0).optional(),
  impressions: z.int().min(0),
  plays3s: z.int().min(0).optional(),
  purchaseValue: z.number().min(0).default(0),
  purchases: z.int().min(0),
  spend: z.number().min(0),
});
export type AdDayRow = z.infer<typeof adDayRowSchema>;

export const trendRowSchema = z.object({
  changePct: z.number(),
  direction: z.enum(["up", "down", "flat"]),
  evidence: z.array(z.url()).max(10).default([]),
  niche: z.string(),
});
export type TrendRow = z.infer<typeof trendRowSchema>;

export const funnelRowSchema = z.object({
  productId: z.string().optional(),
  sales: z.int().min(0),
  sessions: z.int().min(0),
  source: z.string(),
});
export type FunnelRow = z.infer<typeof funnelRowSchema>;

// users/{uid}/optimization/state/snapshots/{date}.
export const snapshotSchema = z.object({
  adDays: z.array(adDayRowSchema).default([]),
  date: z.iso.date(),
  fulfillment: z.array(fulfillmentRowSchema).default([]),
  funnel: z.array(funnelRowSchema).default([]),
  orders: z.array(orderRowSchema).default([]),
  reversals: z.array(reversalRowSchema).default([]),
  stock: z.array(stockRowSchema).default([]),
  trends: z.array(trendRowSchema).default([]),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
