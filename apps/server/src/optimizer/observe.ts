import { pollEventKey } from "@wovain/shared/optimizer/events";
import type { EventFields, StoredEvent } from "@wovain/shared/optimizer/events";
import type {
  FulfillmentRow,
  OrderRow,
  Snapshot,
  SnapshotRows,
  StockRow,
} from "@wovain/shared/optimizer/snapshot";

import type { FourthwallPoll } from "./sources/fourthwall.ts";
import type { MetaPoll } from "./sources/meta.ts";
import { dayOf } from "./store.ts";

// Observe (spec section 3): stored events and poll reads become snapshot
// rows, each filed under the day it belongs to and keeping its source. A
// change the poll sees that no webhook delivered becomes a `poll` event, so
// run records count what the webhooks missed.

type Rows = Map<string, SnapshotRows>;

const add = <K extends keyof SnapshotRows>(
  rows: Rows,
  day: string,
  kind: K,
  items: NonNullable<SnapshotRows[K]>
) => {
  if (items.length === 0) {
    return;
  }
  const current = rows.get(day) ?? {};
  rows.set(day, { ...current, [kind]: [...(current[kind] ?? []), ...items] });
};

type OrderFields = Extract<EventFields, { kind: "order" }>;
type ProductFields = Extract<EventFields, { kind: "product" }>;

const SHIPPED = new Set(["SHIPPED", "PARTIALLY_DELIVERED", "DELIVERED"]);

const orderRowOf = (
  fields: OrderFields,
  at: number,
  designOf: (productId: string) => string | undefined
): OrderRow => {
  const [first] = fields.items;
  const productId = first?.offerId ?? "unknown";
  const units = fields.items.reduce((total, item) => total + item.quantity, 0);
  const placed =
    fields.placedAt === undefined ? Number.NaN : Date.parse(fields.placedAt);
  return {
    adId: fields.utm.content,
    at: Number.isFinite(placed) ? placed : at,
    customerKey: fields.customerKey,
    designId: designOf(productId),
    orderId: fields.orderId,
    productId,
    revenue: Math.max(0, fields.total ?? 0),
    size: first?.size,
    units: Math.max(1, units),
    utmSource: fields.utm.source,
    variantId: first?.variantId,
  };
};

const fulfillmentOf = (
  fields: OrderFields,
  productId: string,
  at: number
): FulfillmentRow => {
  const status = fields.status.toUpperCase();
  return {
    addressChangedAfterShipping:
      SHIPPED.has(status) && /address/iu.test(fields.update ?? ""),
    orderId: fields.orderId,
    productId,
    productionError: false,
    since: at,
    status,
  };
};

const stateOf = (archived: boolean, stock: string): StockRow["state"] => {
  if (archived) {
    return "discontinued";
  }
  return stock === "out_of_stock" ? "out_of_stock" : "in_stock";
};

const stockOf = (fields: ProductFields, at: number): StockRow[] => {
  const archived = /archived|deleted/iu.test(fields.state ?? "");
  return fields.variants.map((variant) => ({
    at,
    color: variant.color,
    productId: fields.productId,
    size: variant.size,
    state: stateOf(archived, variant.stock),
    variantId: variant.variantId,
  }));
};

// A Meta status change to an active state turns polling on.
const ACTIVE = /"ACTIVE"/u;

export interface EventRows {
  metaActive: boolean;
  promotionActive: boolean;
  rows: Rows;
}

const addOrder = (
  rows: Rows,
  fields: OrderFields,
  {
    designOf,
    now,
    receivedAt,
  }: {
    designOf: (productId: string) => string | undefined;
    now: number;
    receivedAt: number;
  }
) => {
  const order = orderRowOf(fields, receivedAt, designOf);
  add(rows, dayOf(order.at), "orders", [order]);
  add(rows, dayOf(now), "fulfillment", [
    fulfillmentOf(fields, order.productId, receivedAt),
  ]);
  if (fields.status.toUpperCase() === "CANCELLED") {
    add(rows, dayOf(receivedAt), "reversals", [
      {
        at: receivedAt,
        cost: 0,
        kind: "cancellation",
        orderId: fields.orderId,
      },
    ]);
  }
};

const isMetaActive = (fields: EventFields) =>
  fields.kind === "meta" &&
  fields.field === "effective_status" &&
  ACTIVE.test(JSON.stringify(fields.value ?? null));

const isPromotionLive = (fields: EventFields) =>
  fields.kind === "promotion" &&
  /live|active|start/iu.test(fields.status ?? "");

// Stored events as rows. testMode events are kept but never acted on.
export const rowsFromEvents = (
  events: StoredEvent[],
  designOf: (productId: string) => string | undefined,
  now: number
): EventRows => {
  const rows: Rows = new Map();
  const live = events.filter((event) => !event.testMode);
  for (const { fields, receivedAt } of live) {
    if (fields.kind === "order") {
      addOrder(rows, fields, { designOf, now, receivedAt });
    } else if (fields.kind === "product") {
      add(rows, dayOf(now), "stock", stockOf(fields, receivedAt));
    }
  }
  return {
    metaActive: live.some((event) => isMetaActive(event.fields)),
    promotionActive: live.some((event) => isPromotionLive(event.fields)),
    rows,
  };
};

// Poll reads as rows: orders and reversals on their own day, Meta's daily
// rows and Fourthwall's daily reports on their date, current states (stock,
// fulfillment, structure, sessions) on today.
const grouped = <T>(items: T[], dayOfRow: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of items) {
    const day = dayOfRow(row);
    groups.set(day, [...(groups.get(day) ?? []), row]);
  }
  return groups;
};

const NO_FOURTHWALL: Pick<
  FourthwallPoll,
  "fulfillment" | "funnel" | "orders" | "profit" | "reversals" | "stock" | "utm"
> = {
  fulfillment: [],
  funnel: [],
  orders: [],
  profit: [],
  reversals: [],
  stock: [],
  utm: [],
};
const NO_META: Pick<MetaPoll, "adDays" | "campaigns" | "metaAds"> = {
  adDays: [],
  campaigns: [],
  metaAds: [],
};

export const rowsFromPolls = (
  fourthwall: FourthwallPoll | undefined,
  meta: MetaPoll | undefined,
  now: number
): Rows => {
  const rows: Rows = new Map();
  const today = dayOf(now);
  const shop = fourthwall ?? NO_FOURTHWALL;
  const ads = meta ?? NO_META;
  for (const [day, items] of grouped(shop.orders, (row) => dayOf(row.at))) {
    add(rows, day, "orders", items);
  }
  for (const [day, items] of grouped(shop.reversals, (row) => dayOf(row.at))) {
    add(rows, day, "reversals", items);
  }
  for (const [day, items] of grouped(shop.utm, (row) => row.date)) {
    add(rows, day, "utm", items);
  }
  for (const [day, items] of grouped(shop.profit, (row) => row.date)) {
    add(rows, day, "profit", items);
  }
  for (const [day, items] of grouped(ads.adDays, (row) => row.date)) {
    add(rows, day, "adDays", items);
  }
  add(rows, today, "fulfillment", shop.fulfillment);
  add(rows, today, "stock", shop.stock);
  add(rows, today, "funnel", shop.funnel);
  add(rows, today, "metaAds", ads.metaAds);
  add(rows, today, "campaigns", ads.campaigns);
  return rows;
};

// Each order's last known fulfillment status across the snapshots.
export const lastStatuses = (snapshots: Snapshot[]) => {
  const statuses = new Map<string, string>();
  for (const snapshot of snapshots) {
    for (const row of snapshot.fulfillment) {
      statuses.set(row.orderId, row.status);
    }
  }
  return statuses;
};

// The order changes the poll saw that no webhook had delivered: an order
// wovain never saw, or a status the snapshots don't have yet.
export const missedEvents = (
  poll: FourthwallPoll,
  known: Map<string, string>,
  now: number
): StoredEvent[] =>
  poll.fulfillment.flatMap((row) =>
    known.get(row.orderId) === row.status
      ? []
      : [
          {
            externalId: row.orderId,
            fields: { kind: "unparsed" },
            key: pollEventKey(
              "order",
              row.orderId,
              poll.versions.find((v) => v.id === row.orderId)?.version ??
                row.status
            ),
            receivedAt: now,
            source: "poll",
            testMode: false,
            type: "ORDER_POLLED",
          },
        ]
  );
