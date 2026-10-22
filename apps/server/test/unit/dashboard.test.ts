import { expect, test } from "vitest";

import {
  adsFrom,
  metaAds,
  metaOrdersFrom,
  reconcile,
  salesFrom,
} from "../../src/lib/dashboard-sections.ts";
import { createDashboardCache } from "../../src/lib/dashboard.ts";
import { num, reportRows, str } from "../../src/lib/report-rows.ts";

test("report rows come from structured content, JSON text or a columns table", () => {
  const rows = [{ date: "2026-10-01", total_sales: 60 }];
  expect(reportRows({ structuredContent: { report: { rows } } })).toEqual(rows);
  expect(
    reportRows({
      content: [{ text: JSON.stringify({ data: rows }), type: "text" }],
    })
  ).toEqual(rows);
  expect(
    reportRows({
      structuredContent: {
        columns: ["date", "total_sales"],
        rows: [["2026-10-01", 60]],
      },
    })
  ).toEqual(rows);
  expect(reportRows({ content: [{ text: "no data", type: "text" }] })).toEqual(
    []
  );
});

test("columns match by name in any case; numbers accept strings and money objects", () => {
  const row = {
    "Net-Profit": "1,234.50",
    totalSales: { amount: 12.5, currency: "USD" },
    units: "n/a",
  };
  expect(num(row, "total_sales")).toBe(12.5);
  expect(num(row, "net_profit")).toBe(1234.5);
  expect(num(row, "units")).toBe(0);
  expect(num(row, "missing")).toBe(0);
});

test("upstream text loses control characters and is bounded", () => {
  expect(str({ name: "Cat\u0007 Tee\n" }, "name")).toBe("Cat  Tee");
  expect(str({ name: "x".repeat(900) }, "name")).toHaveLength(500);
  expect(str({ name: { nested: true } }, "name")).toBeUndefined();
  expect(str({ name: "  " }, "name")).toBeUndefined();
});

const metaRows = [
  {
    amount_spent: "60",
    campaign_id: "555",
    campaign_name: "wovain · launch",
    id: "777",
    name: "wovain d1 · c1",
    omni_purchase: 8,
    omni_purchase_values: 240,
  },
  {
    amount_spent: 40,
    campaign_id: "555",
    campaign_name: "wovain · launch",
    id: "778",
    name: "Boosted post",
    omni_purchase: 0,
  },
];

test("Meta ads roll up by campaign and concept, with ROAS and CPA only where defined", () => {
  const ads = adsFrom(metaAds(metaRows));
  expect(ads?.totals).toEqual({
    cpa: 12.5,
    id: "",
    name: "",
    purchaseValue: 240,
    purchases: 8,
    roas: 2.4,
    spend: 100,
  });
  expect(ads?.campaigns).toHaveLength(1);
  expect(ads?.concepts.map((row) => row.name)).toEqual(["d1 · c1"]);
  const boosted = ads?.ads.find((row) => row.id === "778");
  expect(boosted?.cpa).toBeUndefined();
  expect(adsFrom(metaAds([{ name: "no id" }]))).toBeUndefined();
});

test("sales total the series, map utm_content to the Meta ad and compare with Meta", () => {
  const ads = metaAds(metaRows);
  const sales = salesFrom(
    {
      overTime: [
        {
          contributions: 2,
          date: "2026-10-01",
          net_profit: 19,
          total_sales: 60,
        },
        {
          contributions: 1,
          date: "2026-10-02",
          net_profit: 9.5,
          total_sales: 30,
        },
      ],
      top: [{ net_sales: 90, product: "Sunset Tee", units_sold: 3 }],
      utm: [
        {
          contributions: 2,
          total_sales: 60,
          utm_content: "777",
          utm_source: "facebook",
        },
        { contributions: 1, total_sales: 30, utm_source: "newsletter" },
      ],
    },
    new Map(ads.map((ad) => [ad.id, ad.name]))
  );
  expect(sales?.totals).toEqual({
    aov: 30,
    orders: 3,
    profit: 28.5,
    revenue: 90,
  });
  expect(sales?.utm[0]).toMatchObject({ ad: "wovain d1 · c1", orders: 2 });
  // 2 shop orders from Meta links vs 8 Meta purchases: R1 fails.
  // Counted on every UTM row, not just the 8 the section shows.
  const utm = Array.from({ length: 12 }, (_, index) => ({
    contributions: 1,
    total_sales: 100 - index,
    utm_content: `other-${String(index)}`,
    utm_source: "newsletter",
  }));
  const shown = [...utm, { contributions: 2, utm_source: "facebook" }];
  expect(
    salesFrom({ overTime: [], top: [], utm: shown }, new Map())?.utm
  ).toHaveLength(8);
  expect(metaOrdersFrom(shown)).toBe(2);
  expect(reconcile(2, adsFrom(ads), 30)).toEqual({
    metaPurchases: 8,
    shopOrders: 2,
    status: "fail",
  });
  expect(
    salesFrom({ overTime: [], top: [], utm: [] }, new Map())
  ).toBeUndefined();
});

test("the cache answers one merchant from memory for a minute and never another", async () => {
  let clock = 0;
  const cache = createDashboardCache({ max: 2, now: () => clock });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return await Promise.resolve({
      connections: [],
      generatedAt: new Date(loads).toISOString(),
      products: [],
      range: "28d" as const,
      runs: [],
    });
  };
  const first = await cache("u1", "28d", load);
  expect(await cache("u1", "28d", load)).toBe(first);
  expect(await cache("u2", "28d", load)).not.toBe(first);
  expect(loads).toBe(2);
  clock = 60_000;
  await cache("u1", "28d", load);
  expect(loads).toBe(3);
  await expect(
    cache("u3", "7d", async () => await Promise.reject(new Error("down")))
  ).rejects.toThrow("down");
  await cache("u3", "7d", load);
  expect(loads).toBe(4);
});
