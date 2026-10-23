import type {
  FulfillmentRow,
  FunnelRow,
  OrderRow,
  ProfitRow,
  ReversalRow,
  StockRow,
  UtmRow,
} from "@wovain/shared/optimizer/snapshot";
import { z } from "zod";

import { num, str } from "../../lib/report-rows.ts";
import type { Row } from "../../lib/report-rows.ts";
import { stateOfReads } from "../../lib/upstream-rows.ts";
import { rowsOf } from "../read.ts";
import type { Call, Read } from "../read.ts";

// The reconciliation poll on the merchant's Fourthwall (spec section 2,
// Polling): orders updated since the cursor with their refunds and
// cancellations, fulfillment of orders still in production, the stock of
// every live product, and the analytics reports, cached an hour. Polled
// orders carry no UTM tags, so sales reach an ad through Fourthwall's
// sales-by-UTM report. Everything read here is untrusted data.

const DAY = 86_400_000;
const HOUR = 3_600_000;
// Fourthwall pages orders 10 at a time; a poll reads at most 5 pages.
const PAGE = 10;
const MAX_PAGES = 5;
// get-offers-by-ids and get-fulfillment-details take 10 ids a call.
const IDS = 10;
const IN_PRODUCTION = new Set([
  "CONFIRMED",
  "PARTIALLY_IN_PRODUCTION",
  "IN_PRODUCTION",
]);

export interface Variant {
  color?: string | undefined;
  productId: string;
  size?: string | undefined;
}

export interface FourthwallPoll {
  // The newest `updatedAt` seen, for the next poll.
  cursor?: string;
  fulfillment: FulfillmentRow[];
  funnel: FunnelRow[];
  orders: OrderRow[];
  profit: ProfitRow[];
  reversals: ReversalRow[];
  state: "connected" | "missing" | "error";
  stock: StockRow[];
  utm: UtmRow[];
  // One entry per order state seen, so the poll can tell which changes no
  // webhook delivered (pollEventKey).
  versions: { id: string; version: string }[];
}

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const listOf = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter(isRow) : [];
const timeOf = (value: string | undefined, fallback: number) => {
  const at = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isFinite(at) ? at : fallback;
};

// "Color: Red (#FF0000), Size: Large" → { color: "Red", size: "Large" }.
const attributeOf = (text: string | undefined, name: string) =>
  new RegExp(`${name}:\\s*(?<value>[^,(]+)`, "iu")
    .exec(text ?? "")
    ?.groups?.["value"]?.trim();

const stockState = (offer: Row, variant: Row): StockRow["state"] => {
  const status = str(variant, "status")?.toUpperCase();
  if (
    status === "ARCHIVED" ||
    str(offer, "status")?.toUpperCase() === "ARCHIVED"
  ) {
    return "discontinued";
  }
  const { quantity } = variant;
  return status === "UNAVAILABLE" || quantity === 0
    ? "out_of_stock"
    : "in_stock";
};

// Each live product's variants: their stock, and which product, size and
// color a variant id is (orders name only the variant).
export const offersFrom = (rows: Row[], at: number) => {
  const stock: StockRow[] = [];
  const variants = new Map<string, Variant>();
  for (const offer of rows) {
    const productId = str(offer, "id") ?? "";
    for (const variant of listOf(offer["variants"])) {
      const variantId = str(variant, "id") ?? "";
      const attributes = str(variant, "attributes", "name");
      const color = attributeOf(attributes, "color");
      const size = attributeOf(attributes, "size");
      variants.set(variantId, { color, productId, size });
      stock.push({
        at,
        color,
        productId,
        size,
        state: stockState(offer, variant),
        variantId,
      });
    }
  }
  return { stock, variants };
};

const refundsSchema = z.looseObject({
  hasRefunds: z.boolean().optional(),
  refundedViaCancel: z.boolean().optional(),
  refunds: z
    .array(z.looseObject({ reason: z.string().max(500).nullish() }))
    .default([]),
});

// The order's refund summary, wherever the reply keeps it.
const refundsOf = (order: Row) =>
  refundsSchema.safeParse(
    isRow(order["refundSummary"]) ? order["refundSummary"] : order
  ).data;

const reversalsOf = (
  order: Row,
  orderId: string,
  at: number
): ReversalRow[] => {
  const status = str(order, "status")?.toUpperCase();
  const refunds = refundsOf(order);
  const cancelled = status === "CANCELLED";
  const refunded =
    refunds?.hasRefunds === true && refunds.refundedViaCancel !== true;
  const reason =
    refunds?.refunds.find(
      (refund) => typeof refund.reason === "string" && refund.reason !== ""
    )?.reason ?? undefined;
  return [
    ...(cancelled
      ? [{ at, cost: 0, kind: "cancellation" as const, orderId }]
      : []),
    ...(refunded && !cancelled
      ? [
          {
            at,
            cost: 0,
            kind: "refund" as const,
            orderId,
            ...(reason === undefined ? {} : { reason }),
          },
        ]
      : []),
  ];
};

// Orders as ledger rows, their reversals and fulfillment states.
export const ordersFrom = (
  rows: Row[],
  variants: Map<string, Variant>,
  designOf: (productId: string) => string | undefined,
  now: number
) => {
  const orders: OrderRow[] = [];
  const reversals: ReversalRow[] = [];
  const fulfillment: FulfillmentRow[] = [];
  const versions: FourthwallPoll["versions"] = [];
  for (const order of rows) {
    const orderId = str(order, "id");
    if (orderId === undefined) {
      continue;
    }
    const items = listOf(order["items"]);
    const first = variants.get(str(items[0] ?? {}, "variantId") ?? "");
    const productId = first?.productId ?? "unknown";
    const at = timeOf(str(order, "createdAt"), now);
    const updatedAt = timeOf(str(order, "updatedAt"), at);
    const status = str(order, "status")?.toUpperCase() ?? "UNKNOWN";
    const amounts = isRow(order["amounts"]) ? order["amounts"] : {};
    orders.push({
      at,
      designId: designOf(productId),
      orderId,
      productId,
      revenue: Math.max(0, num(amounts, "merchandiseTotal", "orderTotal")),
      size: first?.size,
      units: Math.max(
        1,
        items.reduce((total, item) => total + num(item, "quantity"), 0)
      ),
    });
    reversals.push(...reversalsOf(order, orderId, updatedAt));
    fulfillment.push({
      addressChangedAfterShipping: false,
      orderId,
      productId,
      productionError: false,
      since: updatedAt,
      status,
    });
    versions.push({
      id: orderId,
      version: `${status}:${String(refundsOf(order)?.hasRefunds === true)}`,
    });
  }
  return { fulfillment, orders, reversals, versions };
};

// Orders whose fulfillment Fourthwall cancelled while the order itself
// stayed open: a misprint or a production failure (POD-O4).
export const productionErrorsFrom = (rows: Row[]) =>
  new Set(
    rows.flatMap((row) =>
      str(row, "status")?.toUpperCase() === "CANCELLED"
        ? [str(row, "orderId") ?? ""]
        : []
    )
  );

// Sales by UTM for rows with an ad id in utm_content.
export const utmFrom = (rows: Row[]): UtmRow[] =>
  rows.flatMap((row) => {
    const adId = str(row, "utm_content");
    const date = str(row, "date")?.slice(0, 10);
    return adId === undefined ||
      date === undefined ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(date)
      ? []
      : [
          {
            adId,
            date,
            revenue: Math.max(0, num(row, "total_sales")),
            sales: Math.max(0, Math.round(num(row, "contributions"))),
            source: str(row, "utm_source"),
          },
        ];
  });

const META_SOURCE = /facebook|instagram|meta/iu;

// Sessions from Meta (traffic source or social platform), for R2.
export const metaSessionsFrom = (rows: Row[]): FunnelRow[] => {
  const meta = rows.filter((row) => META_SOURCE.test(str(row, "source") ?? ""));
  return meta.length === 0
    ? []
    : [
        {
          sales: 0,
          sessions: meta.reduce(
            (total, row) =>
              total + Math.max(0, Math.round(num(row, "session_count"))),
            0
          ),
          source: "meta",
        },
      ];
};

const profitFrom = (rows: Row[]): ProfitRow[] =>
  rows.flatMap((row) => {
    const date = str(row, "date")?.slice(0, 10);
    return date === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
      ? []
      : [{ date, profit: num(row, "profit") }];
  });

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size)
  );

// What a cached report holds.
export const reportRowsSchema = z.array(z.record(z.string(), z.unknown()));
type Cached = (
  key: string,
  load: () => Promise<Row[] | undefined>
) => Promise<Row[] | undefined>;

interface PollDeps {
  cached: Cached;
  call: Call;
  designOf: (productId: string) => string | undefined;
  now: number;
  // Live products' Fourthwall ids (design.productId).
  productIds: string[];
  // Orders updated after this time (ISO); the last 2 days on a first poll.
  since?: string | undefined;
}

const window = (now: number, days: number) => ({
  from: new Date(now - days * DAY).toISOString(),
  to: new Date(now).toISOString(),
});

// A report as rows, read at most once an hour; a failed read isn't cached.
const report = async (deps: PollDeps, tool: string, days: number) =>
  await deps.cached(tool, async () => {
    const read = await deps.call("fourthwall", tool, {
      ...window(deps.now, days),
      aggregationPrecision: "DAY",
    });
    return read.kind === "rows" ? read.rows : undefined;
  });

const orderPages = async (deps: PollDeps, since: string): Promise<Read[]> => {
  const pages: Read[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Each page depends on whether the previous one was full.
    // oxlint-disable-next-line no-await-in-loop
    const read = await deps.call("fourthwall", "ecommerce_get-orders", {
      page,
      size: PAGE,
      updatedAtIsAfter: since,
    });
    pages.push(read);
    if (read.kind !== "rows" || read.rows.length < PAGE) {
      break;
    }
  }
  return pages;
};

export const pollFourthwall = async (
  deps: PollDeps
): Promise<FourthwallPoll> => {
  const { call, now } = deps;
  const since = deps.since ?? new Date(now - 2 * DAY).toISOString();
  const [offerReads, pages] = await Promise.all([
    Promise.all(
      chunks(deps.productIds, IDS).map(
        async (offerIds) =>
          await call("fourthwall", "ecommerce_get-offers-by-ids", { offerIds })
      )
    ),
    orderPages(deps, since),
  ]);
  const { stock, variants } = offersFrom(offerReads.flatMap(rowsOf), now);
  const read = ordersFrom(pages.flatMap(rowsOf), variants, deps.designOf, now);
  const open = read.fulfillment.flatMap((row) =>
    IN_PRODUCTION.has(row.status) ? [row.orderId] : []
  );
  const [details, utm, sessions, profit] = await Promise.all([
    open.length === 0
      ? undefined
      : call("fourthwall", "ecommerce_get-fulfillment-details", {
          includeCancelled: true,
          orderIds: open.slice(0, IDS),
        }),
    report(deps, "ecommerce_get-sales-by-utm-report", 14),
    report(deps, "ecommerce_get-sessions-by-source-report", 7),
    report(deps, "ecommerce_get-total-profit-report", 7),
  ]);
  const errors = productionErrorsFrom(
    details === undefined ? [] : rowsOf(details)
  );
  const newest = Math.max(0, ...read.fulfillment.map((row) => row.since));
  return {
    ...(newest > 0 ? { cursor: new Date(newest).toISOString() } : {}),
    fulfillment: read.fulfillment.map((row) => ({
      ...row,
      productionError: errors.has(row.orderId) && row.status !== "CANCELLED",
    })),
    funnel: metaSessionsFrom(sessions ?? []),
    orders: read.orders,
    profit: profitFrom(profit ?? []),
    reversals: read.reversals,
    state: stateOfReads([...offerReads, ...pages]),
    stock,
    utm: utmFrom(utm ?? []),
    versions: read.versions,
  };
};

export const REPORT_TTL_MS = HOUR;
