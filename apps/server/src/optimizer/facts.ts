import type { Design } from "@wovain/shared/design";
import type {
  AdFacts,
  CampaignFacts,
  DesignFacts,
} from "@wovain/shared/optimizer/facts";
import { isSettled, ledger } from "@wovain/shared/optimizer/ledger";
import { mean } from "@wovain/shared/optimizer/math";
import type { ProductOrders, ProductStock } from "@wovain/shared/optimizer/ops";
import type { ActionRecord, Entity } from "@wovain/shared/optimizer/records";
import type {
  AdDayRow,
  CampaignRow,
  FulfillmentRow,
  MetaAdRow,
  OrderRow,
  ReversalRow,
  Snapshot,
  StockRow,
  UtmRow,
} from "@wovain/shared/optimizer/snapshot";
import { parseAdName } from "@wovain/shared/rules";
import type { Settings } from "@wovain/shared/settings";

// The facts the rules read (packages/shared/src/optimizer/facts.ts), built
// from the last 30 days of snapshots and wovain's records. Shop and Meta
// numbers stay apart: net sales come from Fourthwall, spend and purchases
// from Meta. Data counts only once it has settled: Fourthwall's after
// shopSettleMinutes, Meta's after conversionLagHours.

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;

export const total = <T>(items: T[], pick: (item: T) => number) => {
  let sum = 0;
  for (const item of items) {
    sum += pick(item);
  }
  return sum;
};

// The newest row per key across the snapshots (oldest snapshot first).
const latest = <T>(items: T[], key: (row: T) => string) => [
  ...new Map(items.map((row) => [key(row), row])).values(),
];

// Every row of the window, flattened; current states keep their newest read.
export const flatten = (snapshots: Snapshot[]) => {
  const last = snapshots.at(-1);
  return {
    adDays: snapshots.flatMap((day) => day.adDays),
    campaigns: latest<CampaignRow>(
      snapshots.flatMap((day) => day.campaigns),
      (row) => row.campaignId
    ),
    fulfillment: latest<FulfillmentRow>(
      snapshots.flatMap((day) => day.fulfillment),
      (row) => row.orderId
    ),
    funnel: last?.funnel ?? [],
    metaAds: latest<MetaAdRow>(
      snapshots.flatMap((day) => day.metaAds),
      (row) => row.adId
    ),
    orders: latest<OrderRow>(
      snapshots.flatMap((day) => day.orders),
      (row) => row.orderId
    ),
    profit: snapshots.flatMap((day) => day.profit),
    reversals: snapshots.flatMap((day) => day.reversals),
    stock: latest<StockRow>(
      snapshots.flatMap((day) => day.stock),
      (row) =>
        `${row.productId}:${row.variantId ?? ""}:${row.color ?? ""}:${row.size ?? ""}`
    ),
    trends: last?.trends ?? [],
    utm: snapshots.flatMap((day) => day.utm),
  };
};
export type Rows = ReturnType<typeof flatten>;

// The end of a calendar day (UTC), when its numbers stop moving.
const dayEnd = (date: string) => Date.parse(date) + DAY;

export const settledClock = (settings: Settings, now: number) => {
  const { conversionLagHours, shopSettleMinutes } = settings.optimizer;
  return {
    meta: (row: AdDayRow) =>
      isSettled(dayEnd(row.date), now, conversionLagHours * HOUR),
    order: (row: OrderRow) =>
      isSettled(row.at, now, shopSettleMinutes * MINUTE),
    utm: (row: UtmRow) =>
      isSettled(dayEnd(row.date), now, shopSettleMinutes * MINUTE),
  };
};

const PAUSED = /PAUSED/u;

// Who paused an ad: the optimizer when an applied action of its own says so.
const pausedBy = (adId: string, actions: ActionRecord[]) =>
  actions.some(
    (action) =>
      action.type === "pause_ad" &&
      action.target.id === adId &&
      action.status === "applied"
  )
    ? ("optimizer" as const)
    : ("meta" as const);

interface AdInput {
  actions: ActionRecord[];
  clock: ReturnType<typeof settledClock>;
  // Net sales by ad from orders carrying utm_content (webhook orders).
  ledgerSales: Map<string, number>;
  rows: Rows;
}

// Net sales for an ad on settled Fourthwall data: its UTM-tagged orders
// less their reversals, or Fourthwall's sales-by-UTM count when polled
// orders carry no tags. The larger of the two, so a kill never rests on a
// count that missed sales.
const netSalesOf = (adId: string, input: AdInput, after = 0) => {
  const utm = total(
    input.rows.utm.filter(
      (row) =>
        row.adId === adId && input.clock.utm(row) && dayEnd(row.date) > after
    ),
    (row) => row.sales
  );
  return Math.max(after > 0 ? 0 : (input.ledgerSales.get(adId) ?? 0), utm);
};

export const adFactsOf = (ad: MetaAdRow, input: AdInput): AdFacts => {
  const days = input.rows.adDays
    .filter((row) => row.adId === ad.adId)
    .toSorted((a, b) => a.date.localeCompare(b.date));
  const settled = days.filter(input.clock.meta);
  const recent = days.slice(-3);
  const paused = PAUSED.test(ad.effectiveStatus ?? "");
  const concept = parseAdName(ad.name)?.slot;
  return {
    active: ad.effectiveStatus === "ACTIVE",
    adId: ad.adId,
    clicks: total(days, (row) => row.clicks),
    ...(concept === undefined ? {} : { concept }),
    days,
    impressions: total(days, (row) => row.impressions),
    metaPurchases: total(days, (row) => row.purchases),
    netSales: netSalesOf(ad.adId, input),
    settledSpend: total(settled, (row) => row.spend),
    spend: total(days, (row) => row.spend),
    spendPerDay: mean(recent.map((row) => row.spend)) ?? 0,
    ...(paused
      ? {
          netSalesAfterPause: netSalesOf(ad.adId, input, ad.at),
          paused: { at: ad.at, by: pausedBy(ad.adId, input.actions) },
        }
      : {}),
  };
};

const unitsBySize = (orders: OrderRow[]) => {
  const units = new Map<string, number>();
  for (const order of orders) {
    if (order.size !== undefined) {
      units.set(order.size, (units.get(order.size) ?? 0) + order.units);
    }
  }
  return units;
};

const designAds = (
  design: Design,
  ads: AdFacts[],
  names: Map<string, string>
) =>
  ads.filter(
    (ad) => parseAdName(names.get(ad.adId) ?? "")?.designId === design.id
  );

// Product sessions aren't in Fourthwall's reports per product, so the
// design's Meta link clicks stand in for visits to its page (labelled in
// verify-mr4.md).
export const designFactsOf = (
  design: Design,
  ads: AdFacts[],
  { names, orders }: { names: Map<string, string>; orders: OrderRow[] }
): DesignFacts => {
  const own = designAds(design, ads, names);
  const units = unitsBySize(
    orders.filter((order) => order.designId === design.id)
  );
  return {
    ads: own,
    designId: design.id,
    perSale: design.quote.breakevenPerSale,
    price: design.quote.price,
    productId: design.productId ?? design.id,
    productSessions: total(own, (ad) => ad.clicks),
    sizes: design.sizes.map((size) => ({
      ...size,
      units: units.get(size.size) ?? 0,
    })),
  };
};

// The campaign's facts, only once Meta has given its budget: without one,
// neither a scale nor a cut can be measured.
export const campaignFactsOf = (
  campaign: CampaignRow | undefined,
  { designs, orders }: { designs: DesignFacts[]; orders: OrderRow[] }
): CampaignFacts | undefined => {
  const [first] = designs;
  if (campaign?.dailyBudget === undefined || first === undefined) {
    return undefined;
  }
  const ads = designs.flatMap((design) => design.ads);
  return {
    baseCost: Math.min(...first.sizes.map((size) => size.baseCost)),
    campaignId: campaign.campaignId,
    dailyBudget: campaign.dailyBudget,
    multiUnitOrders: orders.filter((order) => order.units >= 2).length,
    netSales: total(ads, (ad) => ad.netSales),
    orders: orders.length,
    perSale: mean(designs.map((design) => design.perSale)) ?? first.perSale,
    price: first.price,
    spend: total(ads, (ad) => ad.settledSpend),
    spendPerDay: total(ads, (ad) => ad.spendPerDay),
  };
};

// A product's stock for POD-O1; pausedForStock when the optimizer's own
// pause_product_ads on it was applied and not undone.
export const stockFactsOf = (
  design: DesignFacts,
  {
    actions,
    colors,
    orders,
    stock,
  }: {
    actions: ActionRecord[];
    colors: string[];
    orders: OrderRow[];
    stock: StockRow[];
  }
): ProductStock => ({
  adColors: colors,
  adSpendPerDay: total(design.ads, (ad) => (ad.active ? ad.spendPerDay : 0)),
  pausedForStock: actions.some(
    (action) =>
      action.type === "pause_product_ads" &&
      action.target.id === design.productId &&
      action.status === "applied"
  ),
  productId: design.productId,
  sizeUnits: Object.fromEntries(
    unitsBySize(orders.filter((order) => order.productId === design.productId))
  ),
  stock: stock.filter((row) => row.productId === design.productId),
});

// A product's orders for POD-O3 to POD-O5. Fourthwall's production time per
// blank and the carrier window aren't in its API (unverified in its help),
// so POD-O3 is skipped and no shipped order counts as stuck: neither alert
// fires on a guessed number.
export const orderFactsOf = (
  productId: string,
  {
    fulfillment,
    now,
    reversals,
  }: { fulfillment: FulfillmentRow[]; now: number; reversals: ReversalRow[] }
): ProductOrders => {
  const rows = fulfillment.filter((row) => row.productId === productId);
  const ids = new Set(rows.map((row) => row.orderId));
  return {
    carrierDays: Number.POSITIVE_INFINITY,
    now,
    productId,
    reversals: reversals.filter((row) => ids.has(row.orderId)),
    rows,
  };
};

// Net sales per ad from orders tagged with utm_content.
export const ledgerSalesByAd = (orders: OrderRow[], reversals: ReversalRow[]) =>
  new Map(
    [...ledger(orders, reversals, (order) => order.adId)].map(
      ([adId, line]) => [adId, line.netSales]
    )
  );

const designOfEntity = (
  entity: Entity,
  names: Map<string, string>,
  productDesign: (productId: string) => string | undefined
) => {
  if (entity.kind === "ad") {
    return parseAdName(names.get(entity.id) ?? "")?.designId;
  }
  return entity.kind === "product" ? productDesign(entity.id) : undefined;
};

// The entities above a target: its design, the campaign and the shop. Kills
// on a target are blocked by an open block on any of them.
export const ancestorsFor =
  (
    names: Map<string, string>,
    campaignId: string | undefined,
    productDesign: (productId: string) => string | undefined
  ) =>
  (entity: Entity): Entity[] => {
    const shop: Entity = { id: "shop", kind: "shop" };
    const campaign: Entity[] =
      campaignId === undefined ? [] : [{ id: campaignId, kind: "campaign" }];
    const designId = designOfEntity(entity, names, productDesign);
    const design: Entity[] =
      designId === undefined ? [] : [{ id: designId, kind: "design" }];
    return entity.kind === "shop"
      ? []
      : [...design, ...(entity.kind === "campaign" ? [] : campaign), shop];
  };
