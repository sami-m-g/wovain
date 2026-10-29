import { z } from "zod";

import { conversationId } from "./ads";
import { findAll } from "./upstream";
import type { ToolCall } from "./upstream";

// What the merchant's shop and ads did, read through the same MCP sessions
// the seller flow uses: Fourthwall's analytics reports and Meta's campaign
// insights. Replies are untrusted data from the merchant's account; only
// rows with the expected shape are read, and every number is coerced
// defensively because the report envelopes are not documented.

export interface DateRange {
  /** ISO-8601 instants. */
  from: string;
  to: string;
}

export const INSIGHT_RANGES = ["7d", "28d", "90d"] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

const DAYS: Record<InsightRange, number> = { "28d": 28, "7d": 7, "90d": 90 };
const DAY_MS = 86_400_000;
const PERCENT = 100;

export const rangeDates = (
  range: InsightRange,
  now = new Date()
): DateRange => ({
  from: new Date(now.getTime() - DAYS[range] * DAY_MS).toISOString(),
  to: now.toISOString(),
});

/**
 * A money or count value as reports send it: a number, a numeric string, an
 * object with `value`/`amount`, or Meta's `[{ action_type, value }]` list.
 */
export const amountOf = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (Array.isArray(value)) {
    return amountOf(value[0]);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return amountOf(record.value ?? record.amount);
  }
  return undefined;
};

const camel = (key: string) =>
  key.replaceAll(/_(?<letter>[a-z])/gu, (_match, letter: string) =>
    letter.toUpperCase()
  );

/** A column from a report row, whether the API spells it snake_ or camelCase. */
const column = (row: Record<string, unknown>, key: string) =>
  amountOf(row[key] ?? row[camel(key)]);

/** The first row per key: the deep scan can meet a row twice. */
const uniqueBy = <T>(rows: T[], key: (row: T) => string) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = key(row);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
};

const sum = (values: (number | undefined)[]) =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

export interface SalesPoint {
  date: string;
  orders: number;
  profit: number;
  revenue: number;
}

export interface ProductSales {
  margin: number | undefined;
  name: string;
  orders: number;
  profit: number;
  revenue: number;
  unitsSold: number;
}

export interface ShopInsights {
  products: ProductSales[];
  series: SalesPoint[];
  totals: { orders: number; profit: number; revenue: number };
}

const dateRow = z.looseObject({ date: z.string().min(1) });
const productRow = z.looseObject({ product: z.string().min(1) });

/** Days for a month or less, weeks beyond, so a report stays within 31 rows. */
const precisionFor = ({ from, to }: DateRange) =>
  Date.parse(to) - Date.parse(from) > 31 * DAY_MS ? "WEEK" : "DAY";

export const shopInsights = async (
  call: ToolCall,
  range: DateRange
): Promise<ShopInsights> => {
  const [sales, top] = await Promise.all([
    call("ecommerce_get-sales-over-time-report", {
      ...range,
      aggregationPrecision: precisionFor(range),
      filterGroup: "orders",
    }),
    call("ecommerce_get-top-products-by-units-sold-report", { ...range }),
  ]);
  const series = uniqueBy(findAll(dateRow, sales), (row) => row.date).map(
    (row) => ({
      date: row.date,
      orders: column(row, "contributions") ?? 0,
      profit: column(row, "net_profit") ?? 0,
      revenue: column(row, "total_sales") ?? 0,
    })
  );
  const products = uniqueBy(findAll(productRow, top), (row) => row.product).map(
    (row) => {
      const revenue = column(row, "gross_sales") ?? 0;
      const profit = column(row, "profit") ?? 0;
      return {
        margin:
          column(row, "gross_margin") ??
          (revenue > 0 ? (profit / revenue) * PERCENT : undefined),
        name: row.product,
        orders: column(row, "orders") ?? 0,
        profit,
        revenue,
        unitsSold: column(row, "units_sold") ?? 0,
      };
    }
  );
  return {
    products,
    series,
    totals: {
      orders: sum(series.map((point) => point.orders)),
      profit: sum(series.map((point) => point.profit)),
      revenue: sum(series.map((point) => point.revenue)),
    },
  };
};

export interface CampaignInsight {
  clicks: number;
  /** Cost per result (a link click for wovain's traffic campaigns). */
  cpa: number | undefined;
  /** Click-through rate, in percent. */
  ctr: number | undefined;
  id: string;
  impressions: number;
  name: string;
  results: number;
  /** Purchase return on ad spend, when the pixel reports purchases. */
  roas: number | undefined;
  spend: number;
  /** Meta's status for the campaign (PAUSED, ACTIVE, ...), when reported. */
  status: string | undefined;
}

const campaignRow = z.looseObject({
  id: z.union([z.string().min(1), z.number()]),
  name: z.string(),
  status: z.string().optional(),
});

const FIELDS = [
  "id",
  "name",
  "amount_spent",
  "impressions",
  "clicks",
  "ctr",
  "results",
  "cost_per_result",
  "purchase_roas",
  "status",
];

/**
 * Meta's metrics for wovain's campaigns (or, at `level: "ad"`, their ads)
 * on one ad account, over a range or, with `day` (YYYY-MM-DD), that one day.
 */
export const campaignInsights = async (
  call: ToolCall,
  {
    adAccountId,
    campaignIds,
    day,
    level = "campaign",
    range,
  }: {
    adAccountId: string;
    /** The campaign IDs, or the ad IDs at `level: "ad"`. */
    campaignIds: string[];
    day?: string | undefined;
    level?: "ad" | "campaign" | undefined;
    range: InsightRange;
  }
): Promise<CampaignInsight[]> => {
  const reply = await call("ads_get_ad_entities", {
    ad_account_id: adAccountId,
    advertiser_job: "report_measure_or_look_up",
    client_conversation_id: conversationId(),
    ...(day === undefined
      ? { date_preset: `last_${DAYS[range]}d` }
      : { time_range: JSON.stringify({ since: day, until: day }) }),
    fields: FIELDS,
    level,
    object_ids: campaignIds,
    reporting_purpose: ["metric_lookup"],
  });
  const wanted = new Set(campaignIds);
  return uniqueBy(
    findAll(campaignRow, reply).filter((row) => wanted.has(String(row.id))),
    (row) => String(row.id)
  ).map((row) => {
    const spend = column(row, "amount_spent") ?? 0;
    const results = column(row, "results") ?? 0;
    return {
      clicks: column(row, "clicks") ?? 0,
      cpa:
        column(row, "cost_per_result") ??
        (results > 0 ? spend / results : undefined),
      ctr: column(row, "ctr"),
      id: String(row.id),
      impressions: column(row, "impressions") ?? 0,
      name: row.name,
      results,
      roas: column(row, "purchase_roas"),
      spend,
      status: row.status,
    };
  });
};
