import { describe, expect, it } from "vitest";

import {
  AD_RULE_DEFAULTS,
  adRuleSettingsOf,
  decideCampaign,
  killOf,
  stopOf,
  targetsOf,
} from "./ad-rules";
import type { AdResults, CampaignResults } from "./ad-rules";
import { canAutoExecute, DEFAULT_AUTONOMY } from "./autonomy";

const NOW = new Date("2026-10-29T12:00:00Z");
const HOUR_MS = 3_600_000;
const settings = adRuleSettingsOf({});
// A $30 tee that leaves $10 a sale: target CPA $10, break-even ROAS 3.0.
const economics = { priceCents: 3000, profitCents: 1000 };
const targets = targetsOf(economics, settings);

const ad = (over: Partial<AdResults> = {}): AdResults => ({
  active: true,
  adId: "ad1",
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
  purchases: 0,
  spendCents: 0,
  ...over,
});

const campaign = (over: Partial<CampaignResults> = {}): CampaignResults => ({
  ads: [],
  campaignId: "c1",
  dailyBudgetCents: 1000,
  economics,
  learning: false,
  live: true,
  ...over,
});

const decide = (results: CampaignResults, roomCents = 10_000) =>
  decideCampaign(results, settings, { now: NOW, roomCents });

describe("targets", () => {
  it("takes the target CPA from the profit per sale", () => {
    expect(targets).toEqual({
      breakEvenRoas: 3,
      scaleRoas: 3.9000000000000004,
      targetCpaCents: 1000,
    });
  });

  it("has no targets when a sale makes no profit", () => {
    expect(targetsOf({ priceCents: 2000, profitCents: 0 }, settings)).toBe(
      undefined
    );
  });

  it("keeps the defaults when an override is invalid, and applies a valid one", () => {
    expect(adRuleSettingsOf({ minCtr: -1 })).toEqual(AD_RULE_DEFAULTS);
    expect(adRuleSettingsOf({ lossLimitCents: 2000 }).lossLimitCents).toBe(
      2000
    );
  });
});

const kill = (results: Partial<AdResults>) =>
  targets === undefined
    ? undefined
    : killOf(ad(results), targets, settings)?.rule;

describe("kill rules", () => {
  it("kills at 1x the target CPA with no sale and no add-to-cart", () => {
    expect(kill({ spendCents: 999 })).toBe(undefined);
    expect(kill({ spendCents: 1000 })).toBe("no_sale_spend");
  });

  it("gives add-to-carts up to 2x the target CPA", () => {
    expect(kill({ addToCarts: 2, spendCents: 1500 })).toBe(undefined);
    expect(kill({ addToCarts: 2, spendCents: 2000 })).toBe(
      "cart_no_sale_spend"
    );
  });

  it("never kills on spend once the ad has sold", () => {
    expect(kill({ purchases: 1, spendCents: 5000 })).toBe(undefined);
  });

  it("kills a CTR under 0.8% only after 1,000 impressions", () => {
    expect(kill({ clicks: 1, impressions: 999 })).toBe(undefined);
    expect(kill({ clicks: 7, impressions: 1000 })).toBe("low_ctr");
    expect(kill({ clicks: 8, impressions: 1000 })).toBe(undefined);
  });

  it("kills a CPC over the cap only after 10 clicks", () => {
    expect(
      kill({ clicks: 9, impressions: 100, purchases: 1, spendCents: 1800 })
    ).toBe(undefined);
    expect(
      kill({ clicks: 10, impressions: 100, purchases: 1, spendCents: 1600 })
    ).toBe("high_cpc");
  });
});

describe("decideCampaign", () => {
  it("pauses the failing ad and keeps the other running", () => {
    const decision = decide(
      campaign({
        ads: [
          ad({ adId: "a", spendCents: 1000 }),
          ad({ adId: "b", spendCents: 400 }),
        ],
      })
    );
    expect(decision).toMatchObject({
      kills: [{ adId: "a", rule: "no_sale_spend" }],
      kind: "pause_ads",
    });
  });

  it("pauses the campaign when every running ad fails", () => {
    const decision = decide(
      campaign({
        ads: [
          ad({ adId: "a", spendCents: 1000 }),
          ad({ active: false, adId: "b" }),
        ],
      })
    );
    expect(decision.kind).toBe("pause_campaign");
  });

  it("pauses the campaign when a sale leaves no profit", () => {
    expect(
      decide(campaign({ economics: { priceCents: 2000, profitCents: -50 } }))
        .kind
    ).toBe("pause_campaign");
  });

  it("kills even while the ad set learns", () => {
    expect(
      decide(
        campaign({
          ads: [ad({ spendCents: 1200 }), ad({ adId: "b" })],
          learning: true,
        })
      ).kind
    ).toBe("pause_ads");
  });

  const seller = [
    ad({ clicks: 40, impressions: 3000, purchases: 4, spendCents: 3000 }),
  ];

  it("raises a proven seller by 20%", () => {
    expect(decide(campaign({ ads: seller }))).toMatchObject({
      fromCents: 1000,
      kind: "scale",
      toCents: 1200,
    });
  });

  it("holds a raise while learning, under 3 purchases, under target ROAS or within 48 hours", () => {
    expect(decide(campaign({ ads: seller, learning: true })).kind).toBe("hold");
    expect(
      decide(
        campaign({
          ads: [
            ad({
              clicks: 40,
              impressions: 3000,
              purchases: 2,
              spendCents: 1000,
            }),
          ],
        })
      ).kind
    ).toBe("hold");
    // ROAS 3.6 is over break-even 3.0 but under the 3.9 target.
    expect(
      decide(
        campaign({
          ads: [
            ad({
              clicks: 40,
              impressions: 3000,
              purchases: 3,
              spendCents: 2500,
            }),
          ],
        })
      ).kind
    ).toBe("hold");
    expect(
      decide(
        campaign({
          ads: seller,
          lastScaleAt: new Date(NOW.getTime() - 24 * HOUR_MS),
        })
      ).kind
    ).toBe("hold");
    expect(
      decide(
        campaign({
          ads: seller,
          lastScaleAt: new Date(NOW.getTime() - 48 * HOUR_MS),
        })
      ).kind
    ).toBe("scale");
  });

  it("raises only as far as the daily cap allows", () => {
    expect(decide(campaign({ ads: seller }), 100)).toMatchObject({
      kind: "scale",
      toCents: 1100,
    });
    expect(decide(campaign({ ads: seller }), 0).kind).toBe("hold");
  });
});

describe("stopOf", () => {
  const caps = { dailySpendCapCents: 2000, monthlySpendCapCents: 30_000 };

  it("stops at the loss limit", () => {
    expect(
      stopOf(
        {
          monthCents: 7000,
          todayCents: 500,
          totalProfitCents: 2000,
          totalSpendCents: 7000,
        },
        caps,
        settings
      )
    ).toMatchObject({
      numbers: { lossCents: 5000, lossLimitCents: 5000 },
      reason: "loss_limit",
    });
  });

  it("stops at the daily and the monthly cap", () => {
    expect(
      stopOf(
        {
          monthCents: 2000,
          todayCents: 2000,
          totalProfitCents: 0,
          totalSpendCents: 2000,
        },
        caps,
        settings
      )?.reason
    ).toBe("daily_cap");
    expect(
      stopOf(
        {
          monthCents: 30_000,
          todayCents: 100,
          totalProfitCents: 30_000,
          totalSpendCents: 30_000,
        },
        caps,
        settings
      )?.reason
    ).toBe("monthly_cap");
  });

  it("lets a profitable merchant under the caps run", () => {
    expect(
      stopOf(
        {
          monthCents: 4000,
          todayCents: 1000,
          totalProfitCents: 3000,
          totalSpendCents: 4000,
        },
        caps,
        settings
      )
    ).toBe(undefined);
  });
});

describe("protective stops in the policy", () => {
  it("allows a protective pause at level suggest, and while the agent is paused", () => {
    expect(
      canAutoExecute(
        { protective: true, type: "media.ad.pause" },
        { ...DEFAULT_AUTONOMY, paused: true }
      )
    ).toEqual({ reason: "protective_stop", verdict: "allow" });
    expect(
      canAutoExecute(
        { protective: true, type: "media.campaign.pause" },
        DEFAULT_AUTONOMY
      ).verdict
    ).toBe("allow");
  });

  it("never lets protective raise spend", () => {
    expect(
      canAutoExecute(
        { protective: true, spendCents: 100, type: "media.budget.change" },
        {
          ...DEFAULT_AUTONOMY,
          dailySpendCapCents: 10_000,
          monthlySpendCapCents: 300_000,
        }
      ).verdict
    ).toBe("needs_approval");
  });
});
