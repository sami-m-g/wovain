import { z } from "zod";

import { runStatusSchema } from "./autopilot.ts";

// The merchant dashboard (docs/changes/31-merchant-dashboard): sales from
// Fourthwall, ad results from Meta, both on the merchant's own grants, and
// wovain's own records. Every list is capped and every upstream string cut, so
// the widget stays one screen and no reply can grow it.

export const dashboardRanges = ["7d", "28d", "90d"] as const;
export const dashboardRangeSchema = z.enum(dashboardRanges);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;
export const rangeDays: Record<DashboardRange, number> = {
  "28d": 28,
  "7d": 7,
  "90d": 90,
};

export const dashboardInputSchema = z.object({
  range: dashboardRangeSchema.default("28d"),
});

// Text from the merchant's accounts: data to show, never instructions.
export const LABEL_CHARS = 80;
const label = z.string().max(LABEL_CHARS);
const amount = z.number();
const count = z.number().min(0);

export const connectionStates = [
  "connected",
  "missing",
  "unavailable",
  "error",
] as const;
export const dashboardProviders = ["fourthwall", "fal", "meta"] as const;
// The accounts the dashboard reads; fal only shows its state.
export const connectPrompts = ["fourthwall", "meta"] as const;
export type ConnectPrompt = (typeof connectPrompts)[number];
export const isConnectPrompt = (provider: string): provider is ConnectPrompt =>
  (connectPrompts as readonly string[]).includes(provider);

const connectionSchema = z.object({
  provider: z.enum(dashboardProviders),
  state: z.enum(connectionStates),
});
export type DashboardConnection = z.infer<typeof connectionSchema>;

const pointSchema = z.object({
  date: label,
  orders: count,
  profit: amount,
  revenue: amount,
});
export type SalesPoint = z.infer<typeof pointSchema>;

const salesSchema = z.object({
  series: z.array(pointSchema).max(31),
  topProducts: z
    .array(z.object({ name: label, revenue: amount, units: count }))
    .max(5),
  totals: z.object({
    aov: amount.optional(),
    orders: count,
    profit: amount,
    revenue: amount,
  }),
  // Sales by UTM; `ad` names the Meta ad when utm_content is its id.
  utm: z
    .array(
      z.object({
        ad: label.optional(),
        content: label.optional(),
        orders: count,
        revenue: amount,
        source: label,
      })
    )
    .max(8),
});
export type Sales = z.infer<typeof salesSchema>;

// One campaign, ad or concept: Meta-reported numbers over the range.
const adRowSchema = z.object({
  cpa: amount.optional(),
  id: label,
  name: label,
  purchaseValue: amount,
  purchases: count,
  roas: amount.optional(),
  spend: amount,
});
export type AdRow = z.infer<typeof adRowSchema>;

const adsSchema = z.object({
  ads: z.array(adRowSchema).max(8),
  campaigns: z.array(adRowSchema).max(5),
  concepts: z.array(adRowSchema).max(8),
  totals: adRowSchema.omit({ id: true, name: true }),
});
export type Ads = z.infer<typeof adsSchema>;

// Fourthwall orders that came from Meta (by UTM) next to the purchases Meta
// reports: compared, never added (optimizer R1).
const reconciliationSchema = z.object({
  metaPurchases: count,
  shopOrders: count,
  status: z.enum(["pass", "fail", "unknown"]),
});
export type Reconciliation = z.infer<typeof reconciliationSchema>;

export const productStatuses = [
  "live",
  "hidden",
  "publishing",
  "draft",
  "rejected",
  "skipped",
] as const;
const productSchema = z.object({
  designId: z.string().max(20),
  status: z.enum(productStatuses),
  title: label,
  url: z.url().optional(),
});

const runSchema = z.object({
  createdAt: z.iso.datetime(),
  decisions: z
    .array(
      z.object({
        choice: label,
        point: z.string().max(20),
        reason: z.string().max(200),
        subject: label,
      })
    )
    .max(3),
  id: z.string().max(64),
  idea: label,
  spentUsd: count,
  status: runStatusSchema,
});

const optimizerActionSchema = z.object({
  reason: z.string().max(200).optional(),
  status: z.string().max(20),
  target: label,
  type: z.string().max(40),
});

export const dashboardSchema = z.object({
  ads: adsSchema.optional(),
  // The lowest breakeven cost per sale among live products: the line every
  // CPA is read against.
  breakevenPerSale: amount.optional(),
  connections: z.array(connectionSchema).max(dashboardProviders.length),
  // Ad spend per sale: on Fourthwall's orders from Meta links when there are
  // any (shop first), else on the purchases Meta reports.
  costPerSale: amount.optional(),
  generatedAt: z.iso.datetime(),
  // Present only once the optimizer has written actions.
  optimizer: z.array(optimizerActionSchema).max(6).optional(),
  products: z.array(productSchema).max(12),
  range: dashboardRangeSchema,
  reconciliation: reconciliationSchema.optional(),
  runs: z.array(runSchema).max(3),
  sales: salesSchema.optional(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const dashboardResultSchema = z.object({ dashboard: dashboardSchema });
