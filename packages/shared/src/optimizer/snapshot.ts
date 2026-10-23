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

// Fourthwall's sales by UTM for one ad (utm_content) on one day: its own
// count of transactions, which is how polled sales reach an ad.
export const utmRowSchema = z.object({
  adId: z.string(),
  date: z.iso.date(),
  revenue: z.number().min(0).default(0),
  sales: z.int().min(0),
  source: z.string().optional(),
});
export type UtmRow = z.infer<typeof utmRowSchema>;

// Fourthwall's profit report for one day (R4's cross-check).
export const profitRowSchema = z.object({
  date: z.iso.date(),
  profit: z.number(),
});
export type ProfitRow = z.infer<typeof profitRowSchema>;

// One Meta ad's structure as last read: its name maps it to a design.
export const metaAdRowSchema = z.object({
  adId: z.string(),
  at: z.int(),
  campaignId: z.string().optional(),
  effectiveStatus: z.string().optional(),
  name: z.string(),
});
export type MetaAdRow = z.infer<typeof metaAdRowSchema>;

// One Meta campaign's budget and status as last read (budget in dollars).
export const campaignRowSchema = z.object({
  at: z.int(),
  campaignId: z.string(),
  dailyBudget: z.number().min(0).optional(),
  effectiveStatus: z.string().optional(),
});
export type CampaignRow = z.infer<typeof campaignRowSchema>;

// users/{uid}/optimization/state/snapshots/{date}.
export const snapshotSchema = z.object({
  adDays: z.array(adDayRowSchema).default([]),
  campaigns: z.array(campaignRowSchema).default([]),
  date: z.iso.date(),
  fulfillment: z.array(fulfillmentRowSchema).default([]),
  funnel: z.array(funnelRowSchema).default([]),
  metaAds: z.array(metaAdRowSchema).default([]),
  orders: z.array(orderRowSchema).default([]),
  profit: z.array(profitRowSchema).default([]),
  reversals: z.array(reversalRowSchema).default([]),
  stock: z.array(stockRowSchema).default([]),
  trends: z.array(trendRowSchema).default([]),
  utm: z.array(utmRowSchema).default([]),
});

// The rows one observation adds, by kind; the store merges them by key.
export type SnapshotRows = Partial<Omit<Snapshot, "date">>;
export type Snapshot = z.infer<typeof snapshotSchema>;

type RowKind = keyof SnapshotRows;

// The key two rows of one kind are the same thing by: a later read of it
// replaces the earlier one.
const keyOf: {
  [K in RowKind]-?: (row: NonNullable<SnapshotRows[K]>[number]) => string;
} = {
  adDays: (row) => `${row.adId}:${row.date}`,
  campaigns: (row) => row.campaignId,
  fulfillment: (row) => row.orderId,
  funnel: (row) => `${row.source}:${row.productId ?? ""}`,
  metaAds: (row) => row.adId,
  orders: (row) => row.orderId,
  profit: (row) => row.date,
  reversals: (row) => `${row.orderId}:${row.kind}`,
  stock: (row) =>
    `${row.productId}:${row.variantId ?? ""}:${row.color ?? ""}:${row.size ?? ""}`,
  trends: (row) => row.niche,
  utm: (row) => `${row.adId}:${row.date}`,
};

// An order a webhook saw keeps what only the webhook knew (its ad, its UTM
// source, the customer key) when the poll reads it again without them.
const mergeOrder = (old: OrderRow, row: OrderRow): OrderRow => ({
  ...old,
  ...Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined)
  ),
});

const mergeKind = <T>(
  rows: T[],
  added: T[] | undefined,
  key: (row: T) => string,
  merge: (old: T, row: T) => T = (_old, row) => row
) => {
  const byKey = new Map(rows.map((row) => [key(row), row]));
  for (const row of added ?? []) {
    const old = byKey.get(key(row));
    byKey.set(key(row), old === undefined ? row : merge(old, row));
  }
  return [...byKey.values()];
};

// One day's snapshot with new rows folded in, each kind merged by its key.
export const mergeSnapshot = (
  current: Snapshot,
  added: SnapshotRows
): Snapshot => ({
  adDays: mergeKind(current.adDays, added.adDays, keyOf.adDays),
  campaigns: mergeKind(current.campaigns, added.campaigns, keyOf.campaigns),
  date: current.date,
  fulfillment: mergeKind(
    current.fulfillment,
    added.fulfillment,
    keyOf.fulfillment
  ),
  funnel: mergeKind(current.funnel, added.funnel, keyOf.funnel),
  metaAds: mergeKind(current.metaAds, added.metaAds, keyOf.metaAds),
  orders: mergeKind(current.orders, added.orders, keyOf.orders, mergeOrder),
  profit: mergeKind(current.profit, added.profit, keyOf.profit),
  reversals: mergeKind(current.reversals, added.reversals, keyOf.reversals),
  stock: mergeKind(current.stock, added.stock, keyOf.stock),
  trends: mergeKind(current.trends, added.trends, keyOf.trends),
  utm: mergeKind(current.utm, added.utm, keyOf.utm),
});
