import type { Settings } from "../settings.ts";
import type { LedgerLine } from "./ledger.ts";
import { refundRate } from "./ledger.ts";
import type { Entity, Finding } from "./records.ts";
import type { FulfillmentRow, ReversalRow, StockRow } from "./snapshot.ts";

// The operations rules (spec section 4, POD-O1 to POD-O5): what happens after
// a sale. They rest on Fourthwall facts, not sales counts, so they don't wait
// for data to settle and reconciliation blocks don't stop them.
export const opsRuleIds = {
  "POD-O1": "code: cantShip",
  "POD-O2": "code: refundSpike",
  "POD-O3": "code: fulfillmentDelay",
  "POD-O4": "code: productionErrors",
  "POD-O5": "code: shippingIssues",
} as const;

const DAY = 86_400_000;
const product = (id: string): Entity => ({ id, kind: "product" });
const isOut = (row: StockRow) => row.state !== "in_stock";

export interface ProductStock {
  // Colors the ads show (a single one discontinued means a new creative).
  adColors: string[];
  // The product's ads, active, with their total spend per day.
  adSpendPerDay: number;
  // Paused earlier by POD-O1 (resume when stock is back).
  pausedForStock: boolean;
  productId: string;
  // Units sold per size over the last 30 days.
  sizeUnits: Record<string, number>;
  stock: StockRow[];
}

const finding = (
  pattern: Finding["pattern"],
  rule: keyof typeof opsRuleIds,
  productId: string,
  { evidence, facts }: Pick<Finding, "evidence" | "facts">
): Finding => ({
  entity: product(productId),
  evidence,
  facts,
  pattern,
  rule,
  settled: true,
});

const sizesCarryingMost = (
  sizeUnits: Record<string, number>,
  out: Set<string>
) => {
  const total = Object.values(sizeUnits).reduce((sum, n) => sum + n, 0);
  const lost = Object.entries(sizeUnits)
    .filter(([size]) => out.has(size))
    .reduce((sum, [, n]) => sum + n, 0);
  return total > 0 && lost / total > 0.5;
};

// POD-O1: the blank, every listed color, or the sizes carrying most of the
// sales are out of stock or discontinued: pause the product's ads. A single
// discontinued color the ads show needs a new creative instead.
export const cantShip = (item: ProductStock): Finding[] => {
  const blank = item.stock.filter(
    (row) => row.color === undefined && row.size === undefined
  );
  const colors = item.stock.filter((row) => row.color !== undefined);
  const outColors = new Set(
    colors.flatMap((row) => (isOut(row) ? [row.color ?? ""] : []))
  );
  const outSizes = new Set(
    item.stock.flatMap((row) =>
      row.size !== undefined && isOut(row) ? [row.size] : []
    )
  );
  const blankOut = blank.some(isOut);
  const allColorsOut =
    colors.length > 0 && colors.every((row) => outColors.has(row.color ?? ""));
  const blocked =
    blankOut || allColorsOut || sizesCarryingMost(item.sizeUnits, outSizes);
  const evidence: Finding["evidence"] = [
    {
      label: "Out of stock colors",
      source: "fourthwall",
      value: outColors.size,
    },
    { label: "Out of stock sizes", source: "fourthwall", value: outSizes.size },
  ];
  const facts = { spendPerDay: item.adSpendPerDay };
  if (blocked) {
    return [
      finding("blank_out_of_stock", "POD-O1", item.productId, {
        evidence,
        facts,
      }),
    ];
  }
  const shownGone = item.adColors.some((color) =>
    colors.some((row) => row.color === color && row.state === "discontinued")
  );
  if (shownGone) {
    return [
      finding("color_discontinued", "POD-O1", item.productId, {
        evidence,
        facts,
      }),
    ];
  }
  return item.pausedForStock
    ? [finding("restocked", "POD-O1", item.productId, { evidence, facts })]
    : [];
};

// POD-O2: a design's refund and return rate over 30 days is at least
// `refundSpikeMultiple` × the shop's, with at least 3 returned orders.
export const refundSpike = (
  productId: string,
  line: LedgerLine,
  shop: LedgerLine,
  settings: Settings
): Finding[] => {
  const rate = refundRate(line);
  const shopRate = refundRate(shop);
  const spiking =
    line.returned >= 3 &&
    rate >= shopRate * settings.optimizer.refundSpikeMultiple &&
    rate > shopRate;
  return spiking
    ? [
        finding("refund_spike", "POD-O2", productId, {
          evidence: [
            { label: "Refund rate", source: "fourthwall", value: rate },
            {
              label: "Shop refund rate",
              source: "fourthwall",
              value: shopRate,
            },
          ],
          facts: { rate, returned: line.returned, shopRate },
        }),
      ]
    : [];
};

const WAITING = new Set([
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIALLY_IN_PRODUCTION",
]);

// One product's fulfillment rows and the clock, for POD-O3 to POD-O5.
export interface ProductOrders {
  // Days a shipped order may take to arrive (the carrier window).
  carrierDays: number;
  now: number;
  // Fourthwall's stated production time for the blank (from its help);
  // undefined skips POD-O3.
  productionDays?: number | undefined;
  productId: string;
  reversals: ReversalRow[];
  rows: FulfillmentRow[];
}

// POD-O3: orders waiting longer than the blank's production time.
// `lateShare` over half means new buyers will wait too.
export const fulfillmentDelay = ({
  now,
  productId,
  productionDays,
  rows,
}: ProductOrders): Finding[] => {
  if (productionDays === undefined || rows.length === 0) {
    return [];
  }
  const late = rows.filter(
    (row) => WAITING.has(row.status) && now - row.since > productionDays * DAY
  ).length;
  return late > 0
    ? [
        finding("fulfillment_delay", "POD-O3", productId, {
          evidence: [
            { label: "Late orders", source: "fourthwall", value: late },
          ],
          facts: { late, lateShare: late / rows.length },
        }),
      ]
    : [];
};

// POD-O4: skipped or cancelled fulfillments and orders cancelled after
// confirmation. A `count` of 2 or more on one product pauses its ads.
export const productionErrors = ({
  productId,
  rows,
}: ProductOrders): Finding[] => {
  const count = rows.filter(
    (row) => row.productionError || row.status === "CANCELLED"
  ).length;
  return count > 0
    ? [
        finding("production_error", "POD-O4", productId, {
          evidence: [
            { label: "Production errors", source: "fourthwall", value: count },
          ],
          facts: { count },
        }),
      ]
    : [];
};

// POD-O5: shipped with no delivery past the carrier window, an address change
// after shipping, and chargebacks.
export const shippingIssues = ({
  carrierDays,
  now,
  productId,
  reversals,
  rows,
}: ProductOrders): Finding[] => {
  const stuck = rows.filter(
    (row) => row.status === "SHIPPED" && now - row.since > carrierDays * DAY
  ).length;
  const moved = rows.filter((row) => row.addressChangedAfterShipping).length;
  const orderIds = new Set(rows.map((row) => row.orderId));
  const chargebacks = reversals.filter(
    (row) => row.kind === "chargeback" && orderIds.has(row.orderId)
  ).length;
  const shipping = finding("shipping_issue", "POD-O5", productId, {
    evidence: [
      { label: "Not delivered", source: "fourthwall", value: stuck },
      { label: "Address changed", source: "fourthwall", value: moved },
    ],
    facts: { moved, stuck },
  });
  const chargeback = finding("chargeback", "POD-O5", productId, {
    evidence: [
      { label: "Chargebacks", source: "fourthwall", value: chargebacks },
    ],
    facts: { chargebacks },
  });
  return [
    ...(stuck + moved > 0 ? [shipping] : []),
    ...(chargebacks > 0 ? [chargeback] : []),
  ];
};

// Every stock and fulfillment rule for one product (POD-O2 runs per design
// on the ledger).
export const opsFindings = (
  stock: ProductStock,
  orders: ProductOrders
): Finding[] => [
  ...cantShip(stock),
  ...fulfillmentDelay(orders),
  ...productionErrors(orders),
  ...shippingIssues(orders),
];
