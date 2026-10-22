import type { OrderRow, ReversalRow } from "./snapshot.ts";

// Net sales (spec section 3, Reconcile): Fourthwall orders minus refunds,
// cancellations and chargebacks on those orders. The count every decision
// uses; Meta purchases stay a signal.

export interface LedgerLine {
  cancelled: number;
  chargebacks: number;
  netRevenue: number;
  netSales: number;
  orders: number;
  refunded: number;
  // Orders with a refund or a chargeback, each counted once.
  returned: number;
  revenue: number;
  // What the merchant still pays on reversed orders (fees, printed blanks).
  reversalCost: number;
}

const emptyLine = (): LedgerLine => ({
  cancelled: 0,
  chargebacks: 0,
  netRevenue: 0,
  netSales: 0,
  orders: 0,
  refunded: 0,
  returned: 0,
  revenue: 0,
  reversalCost: 0,
});

const countKey = {
  cancellation: "cancelled",
  chargeback: "chargebacks",
  refund: "refunded",
} as const;

// Data younger than `settleMs` isn't settled.
export const isSettled = (at: number, now: number, settleMs: number) =>
  now - at >= settleMs;

// One line per key (ad, design or product). An order reversed twice (a
// refund, then a chargeback) still loses one sale; every reversal's cost counts.
export const ledger = (
  orders: OrderRow[],
  reversals: ReversalRow[],
  keyOf: (order: OrderRow) => string | undefined
) => {
  const lines = new Map<string, LedgerLine>();
  const byOrder = new Map<string, ReversalRow[]>();
  for (const reversal of reversals) {
    byOrder.set(reversal.orderId, [
      ...(byOrder.get(reversal.orderId) ?? []),
      reversal,
    ]);
  }
  for (const order of orders) {
    const key = keyOf(order);
    if (key === undefined) {
      continue;
    }
    const line = lines.get(key) ?? emptyLine();
    const reversed = byOrder.get(order.orderId) ?? [];
    line.orders += 1;
    line.revenue += order.revenue;
    for (const reversal of reversed) {
      line[countKey[reversal.kind]] += 1;
      line.reversalCost += reversal.cost;
    }
    if (reversed.some((reversal) => reversal.kind !== "cancellation")) {
      line.returned += 1;
    }
    if (reversed.length === 0) {
      line.netSales += 1;
      line.netRevenue += order.revenue;
    }
    lines.set(key, line);
  }
  return lines;
};

export const byAd = (order: OrderRow) => order.adId;
export const byDesign = (order: OrderRow) => order.designId;
export const byProduct = (order: OrderRow) => order.productId;

// Refunds, returns and chargebacks over orders: POD-O2's rate.
export const refundRate = (line: LedgerLine) =>
  line.orders > 0 ? line.returned / line.orders : 0;
