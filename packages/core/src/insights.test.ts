import { describe, expect, it, vi } from "vitest";

import {
  amountOf,
  campaignInsights,
  rangeDates,
  shopInsights,
} from "./insights";
import type { ToolCall } from "./upstream";

const RANGE = {
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-26T00:00:00.000Z",
};

const replies =
  (byTool: Record<string, unknown>): ToolCall =>
  (tool) =>
    Promise.resolve(byTool[tool]);

describe("amountOf", () => {
  it("reads numbers, numeric strings, money objects and Meta action lists", () => {
    expect(amountOf(12.5)).toBe(12.5);
    expect(amountOf("3.2")).toBe(3.2);
    expect(amountOf({ currency: "USD", value: 40 })).toBe(40);
    expect(amountOf([{ action_type: "omni_purchase", value: "2.4" }])).toBe(
      2.4
    );
    expect(amountOf("n/a")).toBeUndefined();
    expect(amountOf(null)).toBeUndefined();
  });
});

describe("shopInsights", () => {
  it("sums the sales series and reads product rows in either key style", async () => {
    const call = replies({
      "ecommerce_get-sales-over-time-report": {
        rows: [
          {
            contributions: 2,
            date: "2026-10-01",
            net_profit: 21,
            total_sales: 64,
          },
          {
            contributions: "1",
            date: "2026-10-02",
            netProfit: { value: 11 },
            totalSales: 32,
          },
        ],
      },
      "ecommerce_get-top-products-by-units-sold-report": {
        data: [
          {
            grossSales: 96,
            orders: 3,
            product: "Neon Terminal",
            profit: 32,
            units_sold: 3,
          },
        ],
      },
    });
    const shop = await shopInsights(call, RANGE);
    expect(shop.totals).toEqual({ orders: 3, profit: 32, revenue: 96 });
    expect(shop.series).toHaveLength(2);
    expect(shop.products[0]).toMatchObject({
      name: "Neon Terminal",
      revenue: 96,
      unitsSold: 3,
    });
    expect(shop.products[0]?.margin).toBeCloseTo(33.33, 1);
  });
});

describe("campaignInsights", () => {
  it("keeps only the asked campaigns and derives cost per result", async () => {
    const call = replies({
      ads_get_ad_entities: {
        ad_entities: [
          {
            amount_spent: "30",
            ctr: 1.8,
            id: "cmp_1",
            name: "Neon",
            results: 15,
          },
          { amount_spent: "99", id: "cmp_other", name: "Not ours" },
        ],
      },
    });
    const [only, ...rest] = await campaignInsights(call, {
      adAccountId: "1",
      campaignIds: ["cmp_1"],
      range: "28d",
    });
    expect(rest).toHaveLength(0);
    expect(only).toMatchObject({ cpa: 2, ctr: 1.8, id: "cmp_1", spend: 30 });
  });

  it("reads one day at the ad level for the feedback loop", async () => {
    const call = vi.fn<ToolCall>().mockResolvedValue({ ad_entities: [] });
    await campaignInsights(call, {
      adAccountId: "1",
      campaignIds: ["ad_1"],
      day: "2026-10-27",
      level: "ad",
      range: "7d",
    });
    const [, args] = call.mock.calls[0] ?? [];
    expect(args).toMatchObject({
      level: "ad",
      object_ids: ["ad_1"],
      time_range: '{"since":"2026-10-27","until":"2026-10-27"}',
    });
    expect(args).not.toHaveProperty("date_preset");
  });
});

describe("rangeDates", () => {
  it("ends now and starts the given number of days before", () => {
    const now = new Date("2026-10-26T12:00:00.000Z");
    expect(rangeDates("7d", now)).toEqual({
      from: "2026-10-19T12:00:00.000Z",
      to: "2026-10-26T12:00:00.000Z",
    });
  });
});
