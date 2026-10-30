import { describe, expect, it } from "vitest";

import {
  assessCampaign,
  learningReasons,
  OPTIMIZER_RULES,
  pauseBlockedBy,
  posteriorOf,
  probabilityAbove,
  probabilityBest,
  reviewProposal,
  sampleBeta,
  seededRng,
} from "./optimizer";
import type { AdStats, CampaignState, Limits } from "./optimizer";
import { readCampaign } from "./optimizer-meta";
import { fakeNemotron } from "./test-doubles";

const NOW = new Date("2026-10-28T12:00:00Z");
const DAY_MS = 86_400_000;

const ad = (
  adId: string,
  clicks: number,
  impressions: number,
  spendCents: number,
  active = true
): AdStats => ({ active, adId, clicks, impressions, spendCents });

const state = (overrides: Partial<CampaignState> = {}): CampaignState => ({
  adSetId: "set1",
  ads: [ad("a1", 60, 2000, 3000), ad("a2", 5, 2000, 1000)],
  dailyBudgetCents: 1000,
  live: true,
  metaLearning: "success",
  resultsLast7d: 80,
  ...overrides,
});

const LIMITS: Limits = { dailySpendCapCents: 5000, otherBudgetsCents: 0 };

const assess = (campaign: CampaignState, limits = LIMITS) =>
  assessCampaign(campaign, limits, { now: NOW, rng: seededRng(7) });

describe("the bandit", () => {
  it("draws Beta values with the right mean", () => {
    const rng = seededRng(1);
    const draws = Array.from({ length: 5000 }, () => sampleBeta(3, 7, rng));
    const mean = draws.reduce((total, value) => total + value, 0) / 5000;
    expect(mean).toBeGreaterThan(0.28);
    expect(mean).toBeLessThan(0.32);
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThanOrEqual(1);
  });

  it("starts every ad at Beta(1, 1)", () => {
    expect(posteriorOf(0, 0)).toEqual({ alpha: 1, beta: 1 });
    expect(posteriorOf(10, 100)).toEqual({ alpha: 11, beta: 91 });
    // More clicks than impressions is a reporting glitch, not a rate over 1.
    expect(posteriorOf(5, 3)).toEqual({ alpha: 4, beta: 1 });
  });

  it("finds a clear winner", () => {
    const [winner, loser] = probabilityBest(
      [posteriorOf(60, 2000), posteriorOf(5, 2000)],
      seededRng(3)
    );
    expect(winner).toBeGreaterThan(0.95);
    expect(loser).toBeLessThan(0.05);
  });

  it("stays unsure between two equal ads", () => {
    const [first] = probabilityBest(
      [posteriorOf(20, 1000), posteriorOf(20, 1000)],
      seededRng(4)
    );
    expect(first).toBeGreaterThan(0.4);
    expect(first).toBeLessThan(0.6);
  });

  it("gives the same draws for the same seed", () => {
    const arms = [posteriorOf(3, 100), posteriorOf(4, 100)];
    expect(probabilityBest(arms, seededRng(9))).toEqual(
      probabilityBest(arms, seededRng(9))
    );
  });

  it("tells how sure a rate beats a floor", () => {
    expect(
      probabilityAbove(posteriorOf(100, 2000), 0.009, seededRng(5))
    ).toBeGreaterThan(0.99);
    expect(
      probabilityAbove(posteriorOf(5, 2000), 0.009, seededRng(5))
    ).toBeLessThan(0.01);
  });
});

describe("the learning floor", () => {
  it("holds while Meta reports learning", () => {
    const result = assess(state({ metaLearning: "learning" }));
    expect(result.hold).toBe("learning_phase");
    expect(result.proposal).toBeUndefined();
  });

  it("holds under 50 results in 7 days when Meta says nothing", () => {
    const result = assess(
      state({ metaLearning: undefined, resultsLast7d: 49 })
    );
    expect(result.hold).toBe("learning_phase");
    expect(result.learning.why[0]).toContain("49 results");
  });

  it("holds for 7 days after wovain's own edit", () => {
    const edited = new Date(NOW.getTime() - 3 * DAY_MS);
    expect(assess(state({ lastEditAt: edited })).hold).toBe("learning_phase");
    const longAgo = new Date(NOW.getTime() - 8 * DAY_MS);
    expect(learningReasons(state({ lastEditAt: longAgo }), NOW)).toEqual([]);
  });

  it("lets a learning-limited ad set be edited", () => {
    expect(
      learningReasons(state({ metaLearning: "learning_limited" }), NOW)
    ).toEqual([]);
  });
});

describe("the breakdown-effect guard", () => {
  it("pauses a clear loser with enough delivery", () => {
    const result = assess(state());
    expect(result.proposal).toMatchObject({
      adId: "a2",
      type: "media.ad.pause",
    });
  });

  it("never pauses the ad Meta delivers most, even with the worse average", () => {
    const result = assess(
      state({ ads: [ad("a1", 60, 2000, 1000), ad("a2", 5, 2000, 3000)] })
    );
    expect(result.scores.find((s) => s.adId === "a2")?.protectedBy).toBe(
      "most_delivery"
    );
    expect(result.proposal?.type).not.toBe("media.ad.pause");
  });

  it("falls back to impressions when Meta returns no spend", () => {
    // The Meta field for spend went missing: every ad reads 0.
    const result = assess(
      state({ ads: [ad("a1", 60, 2000, 0), ad("a2", 5, 4000, 0)] })
    );
    expect(result.scores.find((s) => s.adId === "a2")?.protectedBy).toBe(
      "most_delivery"
    );
    expect(result.proposal?.type).not.toBe("media.ad.pause");
  });

  it("says why an approved pause can no longer run", () => {
    const ads = [ad("a1", 60, 2000, 3000), ad("a2", 5, 2000, 1000)];
    expect(pauseBlockedBy(ads, "a2")).toBeUndefined();
    expect(pauseBlockedBy(ads, "a1")).toBe("most_delivery");
    expect(pauseBlockedBy([ads[0] as AdStats], "a1")).toBe("last_active_ad");
    expect(
      pauseBlockedBy([ads[0] as AdStats, ad("a2", 5, 2000, 1000, false)], "a2")
    ).toBe("not_active");
  });

  it("never judges an ad with too little delivery", () => {
    const result = assess(
      state({ ads: [ad("a1", 60, 2000, 3000), ad("a2", 0, 900, 100)] })
    );
    expect(result.scores.find((s) => s.adId === "a2")?.protectedBy).toBe(
      "too_little_delivery"
    );
    expect(result.proposal?.type).not.toBe("media.ad.pause");
  });

  it("keeps the last active ad", () => {
    const result = assess(
      state({
        ads: [ad("a1", 5, 5000, 3000), ad("a2", 60, 2000, 1000, false)],
      })
    );
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0]?.protectedBy).toBe("last_active_ad");
    expect(result.proposal?.type).not.toBe("media.ad.pause");
  });

  it("proposes one change at a time", () => {
    const result = assess(
      state({
        ads: [
          ad("a1", 200, 4000, 3000),
          ad("a2", 2, 2000, 1000),
          ad("a3", 3, 2000, 900),
        ],
      })
    );
    expect(result.proposal).toMatchObject({
      adId: "a2",
      type: "media.ad.pause",
    });
  });
});

describe("the budget rule and the spend caps", () => {
  // Two even ads well above the CTR floor: no pause, a raise.
  const strong = state({
    ads: [ad("a1", 100, 3000, 2000), ad("a2", 100, 3000, 1900)],
  });

  it("raises a strong campaign by at most 20%", () => {
    expect(assess(strong).proposal).toMatchObject({
      fromCents: 1000,
      toCents: 1200,
      type: "media.budget.change",
    });
  });

  it("clamps a raise to the daily cap across wovain's campaigns", () => {
    const result = assess(strong, {
      dailySpendCapCents: 1500,
      otherBudgetsCents: 400,
    });
    expect(result.proposal).toMatchObject({ toCents: 1100 });
  });

  it("proposes no raise with no room under the cap", () => {
    expect(
      assess(strong, { dailySpendCapCents: 0, otherBudgetsCents: 0 }).hold
    ).toBe("no_change_warranted");
    expect(
      assess(strong, { dailySpendCapCents: 1000, otherBudgetsCents: 0 }).hold
    ).toBe("no_change_warranted");
  });

  it("lowers a weak campaign by 20%, never under $1", () => {
    const weak = state({
      ads: [ad("a1", 3, 3000, 2000), ad("a2", 3, 3000, 1900)],
      dailyBudgetCents: 110,
    });
    expect(assess(weak).proposal).toMatchObject({
      toCents: OPTIMIZER_RULES.minBudgetCents,
      type: "media.budget.change",
    });
    expect(assess({ ...weak, dailyBudgetCents: 100 }).hold).toBe(
      "no_change_warranted"
    );
  });

  it("holds a campaign the merchant hasn't started", () => {
    expect(assess(state({ live: false })).hold).toBe("campaign_not_live");
  });
});

describe("the reasoning review", () => {
  it("asks the review agent and returns its verdict", async () => {
    const { ask, asked } = fakeNemotron({
      approve: false,
      reason: "Too few clicks to tell.",
    });
    const { proposal } = assess(state());
    if (proposal === undefined) {
      throw new Error("expected a proposal");
    }
    const review = await reviewProposal(ask, {
      dailyBudgetCents: 1000,
      proposal,
      scores: [],
    });
    expect(review).toEqual({
      approve: false,
      reason: "Too few clicks to tell.",
    });
    expect(asked[0]).toBe("ads_optimizer_review");
  });
});

describe("reading Meta", () => {
  it("reads status, budget, ad counts, sales, spend and learning leniently", async () => {
    const replies: Record<string, unknown> = {
      ad: {
        data: [
          {
            clicks: "40",
            effective_status: "ACTIVE",
            id: "a1",
            impressions: "1500",
            omni_add_to_cart: "5",
            omni_purchase: 2,
            spend: "12.5",
          },
          {
            amount_spent: "0.4",
            effective_status: "PAUSED",
            id: 2,
            impressions: 10,
          },
          { id: "other", impressions: 9 },
        ],
      },
      adset: {
        data: [
          {
            id: "set1",
            learning_stage_info: { status: "SUCCESS" },
            results: 61,
          },
        ],
      },
      campaign: {
        data: [{ daily_budget: "1500", effective_status: "ACTIVE", id: "c1" }],
      },
    };
    const spend: Record<string, unknown> = {
      this_month: { data: [{ amount_spent: "42.10", id: "c1" }] },
      today: { data: [{ amount_spent: "3.5", id: "c1" }] },
    };
    const read = await readCampaign(
      async (_tool, args) =>
        await Promise.resolve(
          spend[String(args.date_preset)] ?? replies[String(args.level)]
        ),
      {
        adAccountId: "1",
        adIds: ["a1", "2", "a3"],
        adSetId: "set1",
        metaCampaignId: "c1",
      }
    );
    expect(read).toEqual({
      ads: [
        {
          active: true,
          adId: "a1",
          addToCarts: 5,
          clicks: 40,
          impressions: 1500,
          purchases: 2,
          spendCents: 1250,
        },
        {
          active: false,
          adId: "2",
          addToCarts: 0,
          clicks: 0,
          impressions: 10,
          purchases: 0,
          spendCents: 40,
        },
        {
          active: false,
          adId: "a3",
          addToCarts: 0,
          clicks: 0,
          impressions: 0,
          purchases: 0,
          spendCents: 0,
        },
      ],
      dailyBudgetCents: 1500,
      live: true,
      metaLearning: "success",
      resultsLast7d: 61,
      spendMonthCents: 4210,
      spendTodayCents: 350,
    });
  });
});
