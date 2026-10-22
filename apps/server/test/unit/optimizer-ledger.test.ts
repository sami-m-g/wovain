import {
  byAd,
  isSettled,
  ledger,
  refundRate,
} from "@wovain/shared/optimizer/ledger";
import {
  change,
  contribution,
  cpa,
  cpm,
  ctr,
  marginalCpa,
  mean,
  roas,
} from "@wovain/shared/optimizer/math";
import {
  blocksFrom,
  checkClicks,
  checkFindings,
  checkPurchases,
  checkRevenue,
  checkTrend,
  checkUtmCoverage,
  isKillBlocked,
} from "@wovain/shared/optimizer/reconcile";
import type { Entity } from "@wovain/shared/optimizer/records";
import type { OrderRow, ReversalRow } from "@wovain/shared/optimizer/snapshot";
import { describe, expect, test } from "vitest";

const sale = (orderId: string, adId = "a1"): OrderRow => ({
  adId,
  at: 0,
  orderId,
  productId: "p1",
  revenue: 30,
  units: 1,
});
const reversal = (
  orderId: string,
  kind: ReversalRow["kind"],
  cost = 0
): ReversalRow => ({ at: 0, cost, kind, orderId });

describe("ledger (net sales)", () => {
  test("subtracts refunds, cancellations and chargebacks once per order", () => {
    const orders = ["o1", "o2", "o3", "o4"].map((id) => sale(id));
    const lines = ledger(
      [...orders, sale("o5", "a2"), { ...sale("o6"), adId: undefined }],
      [
        reversal("o2", "refund", 2),
        reversal("o3", "refund", 1),
        reversal("o3", "chargeback", 15),
        reversal("o4", "cancellation"),
      ],
      byAd
    );
    const a1 = lines.get("a1");
    expect(a1).toEqual({
      cancelled: 1,
      chargebacks: 1,
      netRevenue: 30,
      netSales: 1,
      orders: 4,
      refunded: 2,
      returned: 2,
      revenue: 120,
      reversalCost: 18,
    });
    expect(lines.get("a2")?.netSales).toBe(1);
    expect(lines.size).toBe(2);
    expect(a1 === undefined ? 0 : refundRate(a1)).toBe(0.5);
  });

  test("settles after the window", () => {
    expect(isSettled(0, 59, 60)).toBe(false);
    expect(isSettled(0, 60, 60)).toBe(true);
  });
});

describe("math (ads-math)", () => {
  test("never divides by zero", () => {
    expect(cpa(30, 0)).toBeUndefined();
    expect(roas(30, 0)).toBeUndefined();
    expect(ctr(0, 0)).toBeUndefined();
    expect(cpm(5, 0)).toBeUndefined();
    expect(mean([])).toBeUndefined();
    expect(change(0, 5)).toBeUndefined();
    expect(
      marginalCpa({ after: 50, before: 40 }, { after: 3, before: 3 })
    ).toBeUndefined();
  });

  test("matches hand-computed cases", () => {
    expect(cpa(30, 3)).toBe(10);
    expect(roas(90, 30)).toBe(3);
    expect(ctr(15, 1000)).toBe(0.015);
    expect(cpm(5, 1000)).toBe(5);
    expect(
      marginalCpa({ after: 60, before: 40 }, { after: 5, before: 3 })
    ).toBe(10);
    expect(change(10, 13)).toBeCloseTo(0.3);
    expect(contribution({ netSales: 3, perSale: 10, spend: 20 })).toBe(10);
    // Zero sales: the whole spend is lost, plus what reversed orders cost.
    expect(
      contribution({ netSales: 0, perSale: 10, reversalCost: 5, spend: 20 })
    ).toBe(-25);
  });
});

const ad: Entity = { id: "a1", kind: "ad" };
const campaign: Entity = { id: "c1", kind: "campaign" };

const r1 = (metaPurchases: number, netSales: number, settled = true) =>
  checkPurchases({
    disagreementPct: 30,
    entity: ad,
    metaPurchases,
    netSales,
    settled,
  }).status;

const r3 = (withAdId: number) =>
  checkUtmCoverage({ entity: campaign, metaSourcedSales: 10, withAdId }).status;

const r4 = (ledgerProfit: number) =>
  checkRevenue({ entity: campaign, ledgerProfit, reportedProfit: 100 }).status;

const r5 = (nicheChangePct: number, salesAfter: number) =>
  checkTrend({
    entity: campaign,
    nicheChangePct,
    salesAfter,
    salesBefore: 10,
  }).status;

describe("reconciliation checks", () => {
  test("R1 fails past 30% and 2 sales apart, on settled data only", () => {
    expect(r1(10, 6)).toBe("fail");
    expect(r1(10, 8)).toBe("pass");
    // 100% apart but only one sale: noise on a small sample.
    expect(r1(1, 0)).toBe("pass");
    expect(r1(10, 2, false)).toBe("unknown");
  });

  test("R2 fails when sessions are under half the clicks", () => {
    expect(checkClicks({ clicks: 100, entity: ad, sessions: 40 }).status).toBe(
      "fail"
    );
    expect(checkClicks({ clicks: 100, entity: ad, sessions: 50 }).status).toBe(
      "pass"
    );
    expect(checkClicks({ clicks: 0, entity: ad, sessions: 0 }).status).toBe(
      "unknown"
    );
  });

  test("R3 fails under 80% UTM coverage", () => {
    expect(r3(7)).toBe("fail");
    expect(r3(8)).toBe("pass");
  });

  test("R4 fails when the ledger is off the profit report by over 10%", () => {
    expect(r4(89)).toBe("fail");
    expect(r4(110)).toBe("pass");
  });

  test("R5 flags a swing the niche shares", () => {
    expect(r5(-30, 7)).toBe("fail");
    expect(r5(30, 7)).toBe("pass");
    expect(r5(-5, 7)).toBe("pass");
  });

  test("a failed R1 or R2 blocks kills on the entity and below it", () => {
    const checks = [
      checkPurchases({
        disagreementPct: 30,
        entity: campaign,
        metaPurchases: 10,
        netSales: 4,
        settled: true,
      }),
      checkUtmCoverage({ entity: campaign, metaSourcedSales: 10, withAdId: 1 }),
    ];
    const blocks = blocksFrom(checks, 5);
    expect(blocks).toEqual([
      { check: "R1", entityKey: "campaign:c1", since: 5 },
    ]);
    expect(isKillBlocked(ad, [campaign], blocks)).toBe(true);
    expect(isKillBlocked(ad, [], blocks)).toBe(false);
    expect(
      isKillBlocked(
        ad,
        [campaign],
        [
          {
            check: "R1",
            dismissedReason: "Meta counts view-through",
            entityKey: "campaign:c1",
            since: 5,
          },
        ]
      )
    ).toBe(false);
    expect(checkFindings(checks).map((f) => [f.pattern, f.rule])).toEqual([
      ["source_disagreement", "R1"],
      ["tracking_gap", "R3"],
    ]);
  });
});
