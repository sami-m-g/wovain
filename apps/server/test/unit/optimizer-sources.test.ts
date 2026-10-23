import {
  mergeSnapshot,
  snapshotSchema,
} from "@wovain/shared/optimizer/snapshot";
import { describe, expect, it } from "vitest";

import {
  metaSessionsFrom,
  offersFrom,
  ordersFrom,
  productionErrorsFrom,
  utmFrom,
} from "../../src/optimizer/sources/fourthwall.ts";
import { adDaysFrom, campaignsFrom } from "../../src/optimizer/sources/meta.ts";
import { nextBlocks } from "../../src/optimizer/triage.ts";

const AT = Date.UTC(2027, 0, 15);

describe("Fourthwall poll rows", () => {
  it("reads each variant's stock, color and size from the offer", () => {
    const { stock, variants } = offersFrom(
      [
        {
          id: "off_1",
          status: "PUBLIC",
          variants: [
            {
              attributes: "Color: Red (#FF0000), Size: Large",
              id: "v1",
              quantity: null,
              status: "AVAILABLE",
            },
            {
              attributes: "Color: Red (#FF0000), Size: XL",
              id: "v2",
              quantity: 0,
              status: "AVAILABLE",
            },
            {
              attributes: "Color: Blue, Size: S",
              id: "v3",
              status: "ARCHIVED",
            },
          ],
        },
      ],
      AT
    );
    expect(
      stock.map((row) => [row.variantId, row.color, row.size, row.state])
    ).toEqual([
      ["v1", "Red", "Large", "in_stock"],
      ["v2", "Red", "XL", "out_of_stock"],
      ["v3", "Blue", "S", "discontinued"],
    ]);
    expect(variants.get("v2")).toEqual({
      color: "Red",
      productId: "off_1",
      size: "XL",
    });
  });

  it("turns orders into ledger rows, cancellations and refunds, and drops buyers", () => {
    const variants = new Map([["v1", { productId: "off_1", size: "M" }]]);
    const read = ordersFrom(
      [
        {
          amounts: { merchandiseTotal: { amount: 30, currency: "USD" } },
          createdAt: "2027-01-14T10:00:00Z",
          customerEmail: "buyer@example.com",
          id: "o1",
          items: [{ quantity: 2, variantId: "v1" }],
          refundSummary: {
            hasRefunds: true,
            refunds: [{ reason: "Print faded" }],
          },
          status: "DELIVERED",
          updatedAt: "2027-01-15T10:00:00Z",
        },
        {
          createdAt: "2027-01-14T11:00:00Z",
          id: "o2",
          items: [],
          status: "CANCELLED",
        },
        { status: "OPEN" },
      ],
      variants,
      (productId) => (productId === "off_1" ? "d1" : undefined),
      AT
    );
    expect(read.orders).toEqual([
      expect.objectContaining({
        designId: "d1",
        orderId: "o1",
        productId: "off_1",
        revenue: 30,
        size: "M",
        units: 2,
      }),
      expect.objectContaining({
        orderId: "o2",
        productId: "unknown",
        units: 1,
      }),
    ]);
    expect(read.reversals).toEqual([
      expect.objectContaining({
        kind: "refund",
        orderId: "o1",
        reason: "Print faded",
      }),
      expect.objectContaining({ kind: "cancellation", orderId: "o2" }),
    ]);
    expect(JSON.stringify(read)).not.toContain("buyer@example.com");
  });

  it("flags only cancelled fulfillments as production errors", () => {
    expect([
      ...productionErrorsFrom([
        { orderId: "o1", status: "CANCELLED" },
        { orderId: "o2", status: "IN_PRODUCTION" },
      ]),
    ]).toEqual(["o1"]);
  });

  it("keeps sales by UTM that name an ad, and sessions from Meta", () => {
    expect(
      utmFrom([
        {
          contributions: 3,
          date: "2027-01-14",
          total_sales: 90,
          utm_content: "ad_1",
          utm_source: "facebook",
        },
        { contributions: 1, date: "2027-01-14", total_sales: 30 },
        { contributions: 1, date: "not a date", utm_content: "ad_2" },
      ])
    ).toEqual([
      {
        adId: "ad_1",
        date: "2027-01-14",
        revenue: 90,
        sales: 3,
        source: "facebook",
      },
    ]);
    expect(
      metaSessionsFrom([
        { session_count: 40, source: "Facebook" },
        { session_count: 10, source: "instagram" },
        { session_count: 99, source: "google" },
      ])
    ).toEqual([{ sales: 0, sessions: 50, source: "meta" }]);
  });
});

describe("Meta insight rows", () => {
  it("reads one row per ad per day, and the budget in dollars", () => {
    expect(
      adDaysFrom(
        [
          {
            amount_spent: "12.50",
            date_start: "2027-01-14",
            frequency: 1.4,
            id: "ad_1",
            impressions: 1000,
            link_click: 12,
            omni_purchase: 1,
          },
          { amount_spent: 5, id: "ad_2" },
        ],
        AT
      )
    ).toEqual([
      {
        adId: "ad_1",
        at: AT,
        clicks: 12,
        date: "2027-01-14",
        frequency: 1.4,
        impressions: 1000,
        purchaseValue: 0,
        purchases: 1,
        spend: 12.5,
      },
    ]);
    expect(
      campaignsFrom(
        [{ daily_budget: "2500", effective_status: "active", id: "c1" }],
        AT
      )
    ).toEqual([
      { at: AT, campaignId: "c1", dailyBudget: 25, effectiveStatus: "ACTIVE" },
    ]);
  });
});

describe("snapshot merge", () => {
  it("keeps what only the webhook knew when the poll reads an order again", () => {
    const day = snapshotSchema.parse({ date: "2027-01-14" });
    const webhook = mergeSnapshot(day, {
      orders: [
        {
          adId: "ad_1",
          at: AT,
          orderId: "o1",
          productId: "p",
          revenue: 30,
          units: 1,
          utmSource: "facebook",
        },
      ],
    });
    const polled = mergeSnapshot(webhook, {
      orders: [
        { at: AT, orderId: "o1", productId: "p", revenue: 32, units: 1 },
      ],
    });
    expect(polled.orders).toEqual([
      {
        adId: "ad_1",
        at: AT,
        orderId: "o1",
        productId: "p",
        revenue: 32,
        units: 1,
        utmSource: "facebook",
      },
    ]);
  });
});

describe("kill blocks", () => {
  const ad = { id: "ad_1", kind: "ad" as const };
  const block = { check: "R1", entityKey: "ad:ad_1", since: 1 };

  it("opens on a failed check and keeps its first time and reason", () => {
    const failed = [
      { entity: ad, evidence: [], id: "R1" as const, status: "fail" as const },
    ];
    expect(nextBlocks([], failed, 5)).toEqual([{ ...block, since: 5 }]);
    const dismissed = { ...block, dismissedReason: "Meta counts gifts" };
    expect(nextBlocks([dismissed], failed, 9)).toEqual([dismissed]);
  });

  it("lifts only when the check passes, not when it couldn't run", () => {
    const passed = [
      { entity: ad, evidence: [], id: "R1" as const, status: "pass" as const },
    ];
    const unknown = [
      {
        entity: ad,
        evidence: [],
        id: "R1" as const,
        status: "unknown" as const,
      },
    ];
    expect(nextBlocks([block], passed, 9)).toEqual([]);
    expect(nextBlocks([block], unknown, 9)).toEqual([block]);
    expect(nextBlocks([block], [], 9)).toEqual([block]);
  });
});
