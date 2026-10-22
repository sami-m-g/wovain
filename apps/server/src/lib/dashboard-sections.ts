import type { AutopilotRun } from "@wovain/shared/autopilot";
import { LABEL_CHARS } from "@wovain/shared/dashboard";
import type {
  AdRow,
  Ads,
  Dashboard,
  Reconciliation,
  Sales,
} from "@wovain/shared/dashboard";
import type { Design } from "@wovain/shared/design";
import { cpa, ratio, roas } from "@wovain/shared/optimizer/math";
import { checkPurchases } from "@wovain/shared/optimizer/reconcile";
import type { ActionRecord } from "@wovain/shared/optimizer/records";

import { num, str } from "./report-rows.ts";
import type { Row } from "./report-rows.ts";

// The dashboard's sections from report rows and wovain's records: pure, so
// each shape is tested on its own. Shop (Fourthwall) and Meta numbers stay in
// their own sections and are compared, never added.

const cut = (text: string, chars = LABEL_CHARS) => text.slice(0, chars);

const sum = <T>(items: T[], pick: (item: T) => number) =>
  items.reduce((total, item) => total + pick(item), 0);

// ROAS and CPA from the optimizer's math, which gives no number for a zero
// denominator.
const withRatios = (row: Omit<AdRow, "cpa" | "roas">): AdRow => {
  const costPer = cpa(row.spend, row.purchases);
  const returned = roas(row.purchaseValue, row.spend);
  return {
    ...row,
    ...(costPer === undefined ? {} : { cpa: costPer }),
    ...(returned === undefined ? {} : { roas: returned }),
  };
};

interface MetaAd {
  campaignId: string;
  campaignName: string;
  // `dN · slot` for ads named `wovain dN · slot` (rules.ts adName).
  concept: string | undefined;
  id: string;
  name: string;
  purchases: number;
  purchaseValue: number;
  spend: number;
}

const conceptOf = (name: string) => {
  const groups = /^wovain (?<design>d\d+) · (?<slot>.+)$/u.exec(name)?.groups;
  return groups === undefined
    ? undefined
    : `${groups["design"] ?? ""} · ${groups["slot"] ?? ""}`;
};

// Meta's ad rows (ads_get_ad_entities at ad level), without the ones that
// have no id.
export const metaAds = (rows: Row[]): MetaAd[] =>
  rows.flatMap((row) => {
    const id = str(row, "id", "ad_id");
    const name = str(row, "name", "ad_name") ?? "Ad";
    return id === undefined
      ? []
      : [
          {
            campaignId: str(row, "campaign_id") ?? "unknown",
            campaignName: str(row, "campaign_name") ?? "Campaign",
            concept: conceptOf(name),
            id,
            name,
            purchaseValue: num(
              row,
              "omni_purchase_values",
              "offsite_conversion_fb_pixel_purchase_values",
              "purchase_value"
            ),
            purchases: num(
              row,
              "omni_purchase",
              "offsite_conversion_fb_pixel_purchase",
              "purchases"
            ),
            spend: num(row, "amount_spent", "spend"),
          },
        ];
  });

const byKey = (
  ads: MetaAd[],
  keyOf: (ad: MetaAd) => string | undefined,
  nameOf: (ad: MetaAd) => string,
  max: number
): AdRow[] => {
  const groups = new Map<string, Omit<AdRow, "cpa" | "roas">>();
  for (const ad of ads) {
    const key = keyOf(ad);
    if (key !== undefined) {
      const current = groups.get(key) ?? {
        id: cut(key),
        name: cut(nameOf(ad)),
        purchaseValue: 0,
        purchases: 0,
        spend: 0,
      };
      groups.set(key, {
        ...current,
        purchaseValue: current.purchaseValue + ad.purchaseValue,
        purchases: current.purchases + ad.purchases,
        spend: current.spend + ad.spend,
      });
    }
  }
  return [...groups.values()]
    .toSorted((a, b) => b.spend - a.spend)
    .slice(0, max)
    .map(withRatios);
};

export const adsFrom = (ads: MetaAd[]): Ads | undefined =>
  ads.length === 0
    ? undefined
    : {
        ads: byKey(
          ads,
          (ad) => ad.id,
          (ad) => ad.name,
          8
        ),
        campaigns: byKey(
          ads,
          (ad) => ad.campaignId,
          (ad) => ad.campaignName,
          5
        ),
        concepts: byKey(
          ads,
          (ad) => ad.concept,
          (ad) => ad.concept ?? ad.name,
          8
        ),
        totals: withRatios({
          id: "",
          name: "",
          purchaseValue: sum(ads, (ad) => ad.purchaseValue),
          purchases: sum(ads, (ad) => ad.purchases),
          spend: sum(ads, (ad) => ad.spend),
        }),
      };

type UtmRow = Sales["utm"][number];

const utmFrom = (rows: Row[], adNames: Map<string, string>): UtmRow[] => {
  const groups = new Map<string, UtmRow>();
  for (const row of rows) {
    const source = str(row, "utm_source") ?? "direct";
    const content = str(row, "utm_content");
    const key = JSON.stringify([source, content]);
    const ad = content === undefined ? undefined : adNames.get(content);
    const current = groups.get(key) ?? {
      orders: 0,
      revenue: 0,
      source,
      ...(content === undefined ? {} : { content }),
      ...(ad === undefined ? {} : { ad }),
    };
    groups.set(key, {
      ...current,
      orders: current.orders + num(row, "contributions", "orders"),
      revenue: current.revenue + num(row, "total_sales", "net_sales"),
    });
  }
  return [...groups.values()]
    .toSorted((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
};

// Sales over time, top products and sales by UTM; a UTM row whose
// utm_content is one of the merchant's Meta ad ids names that ad.
export const salesFrom = (
  { overTime, top, utm }: Record<"overTime" | "top" | "utm", Row[]>,
  adNames: Map<string, string>
): Sales | undefined => {
  if (overTime.length + top.length + utm.length === 0) {
    return undefined;
  }
  const series = overTime.slice(-31).map((row) => ({
    date: str(row, "date", "period") ?? "",
    orders: num(row, "contributions", "orders", "total_orders"),
    profit: num(row, "net_profit", "profit"),
    revenue: num(row, "total_sales", "net_sales", "gross_sales"),
  }));
  const revenue = sum(series, (point) => point.revenue);
  const orders = sum(series, (point) => point.orders);
  const aov = ratio(revenue, orders);
  return {
    series,
    topProducts: top
      .map((row) => ({
        name: str(row, "product", "product_name", "name") ?? "Product",
        revenue: num(row, "net_sales", "gross_sales"),
        units: num(row, "units_sold", "units"),
      }))
      .toSorted((a, b) => b.units - a.units)
      .slice(0, 5),
    totals: {
      orders,
      profit: sum(series, (point) => point.profit),
      revenue,
      ...(aov === undefined ? {} : { aov }),
    },
    utm: utmFrom(utm, adNames),
  };
};

const META_SOURCES = /^(?:facebook|fb|meta|instagram|ig)$/iu;

// Fourthwall orders from Meta links next to the purchases Meta reports (R1).
export const reconcile = (
  sales: Sales | undefined,
  ads: Ads | undefined,
  disagreementPct: number
): Reconciliation | undefined => {
  if (sales === undefined || ads === undefined) {
    return undefined;
  }
  const shopOrders = sum(
    sales.utm.filter((row) => META_SOURCES.test(row.source)),
    (row) => row.orders
  );
  const metaPurchases = ads.totals.purchases;
  const { status } = checkPurchases({
    disagreementPct,
    entity: { id: "shop", kind: "shop" },
    metaPurchases,
    netSales: shopOrders,
    settled: true,
  });
  return { metaPurchases, shopOrders, status };
};

const designNumber = (design: Design) => Number(design.id.slice(1));

export const productsFrom = (designs: Design[]): Dashboard["products"] =>
  designs
    .toSorted((a, b) => designNumber(b) - designNumber(a))
    .slice(0, 12)
    .map((design) => ({
      designId: design.id,
      status:
        design.status === "live" && design.hidden === true
          ? "hidden"
          : design.status,
      title: cut(design.dropName ?? design.listing.title),
      ...(design.productUrl === undefined ? {} : { url: design.productUrl }),
    }));

// The strictest breakeven among live products: every CPA reads against it.
export const breakevenOf = (designs: Design[]) => {
  const values = designs.flatMap((design) =>
    design.status === "live"
      ? [design, ...design.range].map(
          (product) => product.quote.breakevenPerSale
        )
      : []
  );
  return values.length === 0 ? undefined : Math.min(...values);
};

export const runsFrom = (runs: AutopilotRun[]): Dashboard["runs"] =>
  runs
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map((run) => ({
      createdAt: run.createdAt,
      decisions: run.decisions
        .slice(-3)
        .toReversed()
        .map((decision) => ({
          choice: cut(decision.choice),
          point: decision.point,
          reason: cut(decision.reason, 200),
          subject: cut(decision.subject),
        })),
      id: run.id,
      idea: cut(run.idea),
      spentUsd: run.spentUsd,
      status: run.status,
    }));

export const optimizerFrom = (actions: ActionRecord[]) =>
  actions.map((action) => ({
    status: action.status,
    target: cut(`${action.target.kind} ${action.target.id}`),
    type: action.type,
    ...(action.reason === undefined ? {} : { reason: cut(action.reason, 200) }),
  }));
