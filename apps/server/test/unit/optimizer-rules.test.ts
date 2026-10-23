import { breakeven, priceProduct } from "@wovain/shared/economics";
import type { AdFacts, DesignFacts } from "@wovain/shared/optimizer/facts";
import type { LedgerLine } from "@wovain/shared/optimizer/ledger";
import {
  cantShip,
  fulfillmentDelay,
  opsFindings,
  productionErrors,
  refundSpike,
  shippingIssues,
} from "@wovain/shared/optimizer/ops";
import type { ProductOrders, ProductStock } from "@wovain/shared/optimizer/ops";
import {
  adKill,
  designFindings,
  designKill,
  fatigue,
  isJudgeable,
  missedSale,
  noClick,
  singleConcept,
} from "@wovain/shared/optimizer/pod";
import type { Finding } from "@wovain/shared/optimizer/records";
import {
  bundle,
  campaignRules,
  capConfidence,
  seasonal,
  shopWide,
  sizeMix,
  trackingGap,
} from "@wovain/shared/optimizer/shop";
import type { AdDayRow } from "@wovain/shared/optimizer/snapshot";
import { defaultSettings } from "@wovain/shared/settings";
import { describe, expect, test } from "vitest";

// The demo tee: $30 on a $17.70 blank leaves $10.32 per sale before ads, so
// the ad kill line is $30.96 and the design kill line $41.28.
const settings = defaultSettings();
const PER_SALE = breakeven(30, 17.7, settings.economics).perSale;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-20T00:00:00Z");

const ad = (overrides: Partial<AdFacts> = {}): AdFacts => ({
  active: true,
  adId: "a1",
  clicks: 100,
  days: [],
  impressions: 10_000,
  metaPurchases: 0,
  netSales: 0,
  settledSpend: 0,
  spend: 0,
  spendPerDay: 10,
  ...overrides,
});
const design = (
  ads: AdFacts[],
  overrides: Partial<DesignFacts> = {}
): DesignFacts => ({
  ads,
  designId: "d1",
  perSale: PER_SALE,
  price: 30,
  productId: "p1",
  productSessions: 50,
  sizes: [{ baseCost: 17.7, size: "M", units: 0 }],
  ...overrides,
});
const patterns = (findings: Finding[]) =>
  findings.map((f) => [f.pattern, f.entity.id, f.rule]);

describe("kills (POD-K1 to POD-K4)", () => {
  const seller = ad({ adId: "a2", netSales: 2 });

  test("K1 pauses one ad when its sibling sells", () => {
    const loser = ad({ settledSpend: 31, spend: 31 });
    const findings = adKill(design([loser, seller]), settings);
    expect(patterns(findings)).toEqual([["ad_no_sale", "a1", "POD-K1"]]);
    expect(findings[0]?.facts).toMatchObject({ activeSiblings: 1 });
  });

  test("K1 also fires on a CTR under half its siblings'", () => {
    const weak = ad({ clicks: 20, settledSpend: 31, spend: 31 });
    const sibling = ad({ adId: "a2", clicks: 100 });
    expect(patterns(adKill(design([weak, sibling]), settings))).toEqual([
      ["ad_no_sale", "a1", "POD-K1"],
    ]);
  });

  test("no kill under the line, with a sale, or when the ad is as good as its siblings", () => {
    expect(adKill(design([ad({ spend: 30 }), seller]), settings)).toEqual([]);
    expect(
      adKill(
        design([ad({ metaPurchases: 1, settledSpend: 40, spend: 40 }), seller]),
        settings
      )
    ).toEqual([]);
    expect(
      adKill(
        design([ad({ settledSpend: 40, spend: 40 }), ad({ adId: "a2" })]),
        settings
      )
    ).toEqual([]);
  });

  test("K4 makes spend past the line on unsettled data an early warning", () => {
    const findings = adKill(
      design([ad({ settledSpend: 20, spend: 31 }), seller]),
      settings
    );
    expect(patterns(findings)).toEqual([["unsettled_spend", "a1", "POD-K4"]]);
    expect(findings[0]?.settled).toBe(false);
  });

  test("K2 judges the design when all its ads spent past the line with visits and no sale", () => {
    const ads = [
      ad({ settledSpend: 21, spend: 21 }),
      ad({ adId: "a2", settledSpend: 21, spend: 21 }),
    ];
    expect(patterns(designKill(design(ads), settings))).toEqual([
      ["clicks_no_sale", "d1", "POD-K2"],
    ]);
    expect(designKill(design(ads, { productSessions: 0 }), settings)).toEqual(
      []
    );
    expect(
      designKill(design([...ads, ad({ adId: "a3", netSales: 1 })]), settings)
    ).toEqual([]);
  });

  test("K3 asks for a new creative when nobody clicks and the design isn't judged yet", () => {
    const quiet = [
      ad({ clicks: 30, spend: 10 }),
      ad({ adId: "a2", clicks: 20, spend: 10 }),
    ];
    expect(patterns(noClick(design(quiet), settings))).toEqual([
      ["no_click", "d1", "POD-K3"],
    ]);
    expect(
      noClick(design(quiet.map((a) => ({ ...a, spend: 30 }))), settings)
    ).toEqual([]);
  });
});

const day = (index: number, overrides: Partial<AdDayRow> = {}): AdDayRow => {
  const date = new Date(Date.UTC(2026, 9, 1 + index));
  return {
    adId: "a1",
    at: date.getTime() + DAY,
    clicks: 20,
    date: date.toISOString().slice(0, 10),
    frequency: 1.5,
    impressions: 1000,
    plays3s: 300,
    purchaseValue: 0,
    purchases: 0,
    spend: 5,
    ...overrides,
  };
};
const worn = { clicks: 10, frequency: 2.2, plays3s: 200 };
const series = Array.from({ length: 10 }, (_, i) => day(i, i >= 7 ? worn : {}));

describe("creative (POD-C1, POD-C2) and drops (POD-S2)", () => {
  test("C1 sees fatigue in the ad's own series", () => {
    const findings = fatigue(design([ad({ days: series })]), NOW, settings);
    expect(patterns(findings)).toEqual([["creative_fatigue", "a1", "POD-C1"]]);
    expect(findings[0]?.facts).toMatchObject({ ctrBefore: 0.02, ctrNow: 0.01 });
  });

  test("C1 needs CTR, frequency and hook rate to move together", () => {
    const steadyFrequency = series.map((row) => ({ ...row, frequency: 1.5 }));
    expect(
      fatigue(design([ad({ days: steadyFrequency })]), NOW, settings)
    ).toEqual([]);
    const fewDays = series.slice(0, 6);
    expect(fatigue(design([ad({ days: fewDays })]), NOW, settings)).toEqual([]);
  });

  test("C1 ignores days Meta hasn't settled", () => {
    const early = Date.parse("2026-10-11T00:00:00Z");
    expect(fatigue(design([ad({ days: series })]), early, settings)).toEqual(
      []
    );
  });

  test("C2 counts concepts, not clips", () => {
    const same = [
      ad({ concept: "cat-dad" }),
      ad({ adId: "a2", concept: "cat-dad" }),
    ];
    expect(patterns(singleConcept(design(same)))).toEqual([
      ["single_concept", "d1", "POD-C2"],
    ]);
    expect(
      singleConcept(
        design([same[0] ?? ad(), ad({ adId: "a2", concept: "sunset" })])
      )
    ).toEqual([]);
  });

  test("S2 judges a drop only after its lag and warm-up", () => {
    const launched = NOW - 100 * HOUR;
    expect(isJudgeable({ dropLaunchedAt: launched }, NOW, settings)).toBe(
      false
    );
    expect(
      isJudgeable({ dropLaunchedAt: launched }, NOW + 20 * HOUR, settings)
    ).toBe(true);
    const killable = design(
      [ad({ settledSpend: 50, spend: 50 }), ad({ adId: "a2", netSales: 1 })],
      {
        dropLaunchedAt: launched,
      }
    );
    expect(designFindings(killable, NOW, settings)).toEqual([]);
    expect(
      patterns(designFindings(killable, NOW + 20 * HOUR, settings))
    ).toEqual([["ad_no_sale", "a1", "POD-K1"]]);
  });
});

describe("economics (POD-E2 to POD-E5)", () => {
  test("E2 offers a price for the costly sizes when the mix erodes margin", () => {
    const sizes = [
      { baseCost: 17.7, size: "M", units: 2 },
      { baseCost: 24, size: "3XL", units: 8 },
    ];
    const findings = sizeMix(design([], { sizes }), settings);
    expect(patterns(findings)).toEqual([
      ["size_mix_erodes_margin", "d1", "POD-E2"],
    ]);
    const floor = priceProduct(
      [{ baseCost: 24, size: "3XL" }],
      settings.pricing,
      settings.economics
    );
    expect(findings[0]?.facts["suggestedPrice"]).toBe(floor.price);
    expect(findings[0]?.facts["suggestedPrice"]).toBe(37);
    expect(
      sizeMix(
        design([], { sizes: [{ baseCost: 17.7, size: "M", units: 5 }] }),
        settings
      )
    ).toEqual([]);
  });

  test("E4 prices a bundle with one shipping charge and one fixed card fee", () => {
    const { cardFeeFixed, cardFeePct, shipping } = settings.economics;
    expect(bundle(30, 17.7, settings.economics)).toBeCloseTo(
      2 * PER_SALE + cardFeeFixed + (shipping * cardFeePct) / 100
    );
  });

  const campaign = {
    baseCost: 17.7,
    campaignId: "c1",
    dailyBudget: 15,
    multiUnitOrders: 0,
    netSales: 10,
    orders: 10,
    perSale: PER_SALE,
    price: 30,
    spend: 70,
    spendPerDay: 15,
  };

  test("E4 suggests a bundle between 1× and 1.5× breakeven", () => {
    const findings = campaignRules(
      { ...campaign, multiUnitOrders: 2, spend: 120 },
      settings
    );
    expect(patterns(findings)).toEqual([["low_aov", "c1", "POD-E4"]]);
  });

  test("B1 finds a capped winner on net sales", () => {
    expect(patterns(campaignRules(campaign, settings))).toEqual([
      ["winner_capped", "c1", "POD-B1"],
    ]);
    expect(campaignRules({ ...campaign, spendPerDay: 10 }, settings)).toEqual(
      []
    );
    expect(
      campaignRules({ ...campaign, netSales: 9, spend: 60 }, settings)
    ).toEqual([]);
  });

  test("a campaign above breakeven with no bundle room gets a budget cut", () => {
    expect(
      patterns(campaignRules({ ...campaign, spend: 200 }, settings))
    ).toEqual([["over_breakeven", "c1", "POD-E1"]]);
  });

  test("E5, M2, S4: code caps the model's confidence", () => {
    const sure = {
      bothSettled: true,
      coldStart: false,
      isKill: true,
      netSales: 5,
      nicheFalling: false,
      purchasesCheckPassed: true,
      tagUtmContent: true,
    };
    expect(capConfidence("high", sure)).toBe("high");
    expect(capConfidence("high", { ...sure, netSales: 2 })).toBe("medium");
    expect(
      capConfidence("high", { ...sure, purchasesCheckPassed: false })
    ).toBe("medium");
    expect(capConfidence("high", { ...sure, nicheFalling: true })).toBe(
      "medium"
    );
    expect(
      capConfidence("high", { ...sure, isKill: false, nicheFalling: true })
    ).toBe("high");
    expect(capConfidence("high", { ...sure, coldStart: true })).toBe("low");
    expect(capConfidence("high", { ...sure, tagUtmContent: false })).toBe(
      "medium"
    );
    expect(capConfidence("low", { ...sure, tagUtmContent: false })).toBe("low");
    expect(capConfidence("unknown", sure)).toBe("unknown");
  });
});

describe("seasons, the shop and measurement (POD-S1, S3, M1, M3)", () => {
  test("S1 stops scaling near the cutoff and pauses after the season", () => {
    const at = (endsAt: number, shipByAt?: number) =>
      patterns(
        seasonal(
          design([], {
            season: shipByAt === undefined ? { endsAt } : { endsAt, shipByAt },
          }),
          NOW
        )
      );
    expect(at(NOW - DAY)).toEqual([["seasonal_end", "d1", "POD-S1"]]);
    expect(at(NOW + 20 * DAY, NOW + 5 * DAY)).toEqual([
      ["seasonal_cutoff", "d1", "POD-S1"],
    ]);
    expect(at(NOW + 30 * DAY, NOW + 20 * DAY)).toEqual([]);
  });

  test("S3 labels a swing every design shares, or a promotion", () => {
    expect(patterns(shopWide([0.4, 0.5], false))).toEqual([
      ["shop_wide", "shop", "POD-S3"],
    ]);
    expect(shopWide([0.4, -0.5], false)).toEqual([]);
    expect(shopWide([0.1, 0.5], false)).toEqual([]);
    expect(shopWide([], true)).toHaveLength(1);
  });

  test("M1 raises a tracking gap without CAPI events or with R1 failing", () => {
    expect(patterns(trackingGap(0, false))).toEqual([
      ["tracking_gap", "shop", "POD-M1"],
    ]);
    expect(trackingGap(10, false)).toEqual([]);
    expect(trackingGap(10, true)).toHaveLength(1);
  });

  test("M3 finds a sale a paused ad made after its pause", () => {
    const paused = ad({
      active: false,
      netSalesAfterPause: 1,
      paused: { at: 0, by: "meta" },
      spend: 40,
    });
    const findings = missedSale(design([paused]));
    expect(patterns(findings)).toEqual([["missed_sale", "a1", "POD-M3"]]);
    expect(findings[0]?.facts).toMatchObject({
      pausedByOptimizer: 0,
      shopCpa: 40,
    });
    expect(missedSale(design([ad({ paused: { at: 0, by: "meta" } })]))).toEqual(
      []
    );
  });
});

const stock = (overrides: Partial<ProductStock> = {}): ProductStock => ({
  adColors: [],
  adSpendPerDay: 12,
  pausedForStock: false,
  productId: "p1",
  sizeUnits: { L: 4, M: 6 },
  stock: [],
  ...overrides,
});
const row = (
  state: "in_stock" | "out_of_stock" | "discontinued",
  where: { color?: string; size?: string } = {}
) => ({ at: 0, productId: "p1", state, ...where });

const line = (orders: number, returned: number): LedgerLine => ({
  cancelled: 0,
  chargebacks: 0,
  netRevenue: 0,
  netSales: orders - returned,
  orders,
  refunded: returned,
  returned,
  revenue: 0,
  reversalCost: 0,
});

const orders = (overrides: Partial<ProductOrders> = {}): ProductOrders => ({
  carrierDays: 10,
  now: NOW,
  productId: "p1",
  productionDays: 5,
  reversals: [],
  rows: [],
  ...overrides,
});

const fulfillment = (
  orderId: string,
  status: string,
  daysAgo: number,
  extra: {
    addressChangedAfterShipping?: boolean;
    productionError?: boolean;
  } = {}
) => ({
  addressChangedAfterShipping: false,
  orderId,
  productId: "p1",
  productionError: false,
  since: NOW - daysAgo * DAY,
  status,
  ...extra,
});

describe("operations (POD-O1 to POD-O5)", () => {
  test("O1 pauses ads when the blank, every color or the main sizes can't ship", () => {
    const blocked = (rows: ReturnType<typeof row>[]) =>
      patterns(cantShip(stock({ stock: rows })));
    const blank = [["blank_out_of_stock", "p1", "POD-O1"]];
    expect(blocked([row("out_of_stock")])).toEqual(blank);
    expect(
      blocked([
        row("discontinued", { color: "Black" }),
        row("out_of_stock", { color: "Navy" }),
      ])
    ).toEqual(blank);
    expect(blocked([row("out_of_stock", { size: "M" })])).toEqual(blank);
    expect(blocked([row("out_of_stock", { size: "L" })])).toEqual([]);
    expect(cantShip(stock({ stock: [row("out_of_stock")] }))[0]?.facts).toEqual(
      {
        spendPerDay: 12,
      }
    );
  });

  test("O1 asks for a new creative when one color the ads show is discontinued", () => {
    const rows = [
      row("discontinued", { color: "Black" }),
      row("in_stock", { color: "Navy" }),
    ];
    expect(
      patterns(cantShip(stock({ adColors: ["Black"], stock: rows })))
    ).toEqual([["color_discontinued", "p1", "POD-O1"]]);
    expect(cantShip(stock({ adColors: ["Navy"], stock: rows }))).toEqual([]);
  });

  test("O1 resumes only ads it paused, once stock is back", () => {
    expect(
      patterns(
        cantShip(stock({ pausedForStock: true, stock: [row("in_stock")] }))
      )
    ).toEqual([["restocked", "p1", "POD-O1"]]);
  });

  test("O2 flags a design refunded at twice the shop's rate with 3 returns", () => {
    expect(
      patterns(refundSpike("p1", line(10, 3), line(100, 5), settings))
    ).toEqual([["refund_spike", "p1", "POD-O2"]]);
    expect(refundSpike("p1", line(10, 2), line(100, 1), settings)).toEqual([]);
    expect(refundSpike("p1", line(10, 3), line(100, 20), settings)).toEqual([]);
  });

  test("O3 counts orders waiting past the blank's production time", () => {
    const rows = [
      fulfillment("o1", "IN_PRODUCTION", 7),
      fulfillment("o2", "CONFIRMED", 6),
      fulfillment("o3", "IN_PRODUCTION", 1),
    ];
    const findings = fulfillmentDelay(orders({ rows }));
    expect(patterns(findings)).toEqual([["fulfillment_delay", "p1", "POD-O3"]]);
    expect(findings[0]?.facts["lateShare"]).toBeCloseTo(2 / 3);
    expect(
      fulfillmentDelay(orders({ productionDays: undefined, rows }))
    ).toEqual([]);
  });

  test("O4 counts production failures, never buyer cancellations", () => {
    const rows = [
      fulfillment("o1", "CANCELLED", 1),
      fulfillment("o2", "IN_PRODUCTION", 1, { productionError: true }),
      fulfillment("o3", "SHIPPED", 1),
      fulfillment("o4", "CANCELLED", 1, { productionError: true }),
    ];
    expect(productionErrors(orders({ rows }))[0]?.facts).toEqual({ count: 2 });
    const cancelledByBuyers = [
      fulfillment("o5", "CANCELLED", 1),
      fulfillment("o6", "CANCELLED", 2),
    ];
    expect(productionErrors(orders({ rows: cancelledByBuyers }))).toEqual([]);
    expect(
      productionErrors(
        orders({ rows: [rows[2] ?? fulfillment("x", "SHIPPED", 0)] })
      )
    ).toEqual([]);
  });

  test("O5 raises stuck shipments, late address changes and chargebacks", () => {
    const rows = [
      fulfillment("o1", "SHIPPED", 12),
      fulfillment("o2", "SHIPPED", 2, { addressChangedAfterShipping: true }),
    ];
    const findings = shippingIssues(
      orders({
        reversals: [
          { at: 0, cost: 15, kind: "chargeback", orderId: "o2" },
          { at: 0, cost: 15, kind: "chargeback", orderId: "elsewhere" },
        ],
        rows,
      })
    );
    expect(patterns(findings)).toEqual([
      ["shipping_issue", "p1", "POD-O5"],
      ["chargeback", "p1", "POD-O5"],
    ]);
    expect(findings[1]?.facts).toEqual({ chargebacks: 1 });
    expect(
      shippingIssues(orders({ rows: [fulfillment("o1", "SHIPPED", 2)] }))
    ).toEqual([]);
  });

  test("opsFindings runs every stock and fulfillment rule", () => {
    expect(
      patterns(
        opsFindings(
          stock({ stock: [row("out_of_stock")] }),
          orders({
            rows: [
              fulfillment("o1", "IN_PRODUCTION", 1, { productionError: true }),
            ],
          })
        )
      )
    ).toEqual([
      ["blank_out_of_stock", "p1", "POD-O1"],
      ["production_error", "p1", "POD-O4"],
    ]);
  });
});
