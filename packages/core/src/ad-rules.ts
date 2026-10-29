import { z } from "zod";

// Profit rules for a merchant's Meta campaigns (openspec change
// ads-profit-rules, flag ads-profit-rules): when to pause an ad or a
// campaign that isn't selling, when to stop everything, and when a seller
// earns more budget. They read money, not clicks: the target cost per
// purchase is what one sale leaves after the blank, fees and the refund
// reserve (./pricing.ts), so an ad that spends that much without a sale has
// already lost a sale's profit.
//
// Sources for the defaults:
// - Meta's learning phase: about 50 optimization events in 7 days after the
//   last significant edit (Meta Business Help Center, "About the learning
//   phase", https://www.facebook.com/business/help/112167992830700). No
//   raise while an ad set learns.
// - Kill at 1x target CPA with no purchase: the founder's rule, tighter than
//   the 1.5x to 3x agencies use (e.g. https://www.bestever.ai/post/automated-rules-facebook,
//   https://www.k6agency.com/facebook-ads-auto-rules/). A product with
//   add-to-carts gets up to 2x before it is cut.
// - CTR floor 0.8% after 1,000 impressions: below the ~0.9% to 1.5% Meta
//   apparel and traffic campaigns usually see (WordStream's Facebook ads
//   benchmarks), and the optimizer's own 1,000-impression floor.
// - Scale by 20% at most every 48 hours: the common rule for raising a
//   budget without resetting learning (https://hunchads.com/blog/how-to-use-automated-rules-to-scale-facebook-ad-campaigns,
//   https://www.attnagency.com/blog/scale-facebook-ads-maintain-cpa).
// - Scale only at ROAS of at least 1.3x break-even with 3 or more purchases,
//   so one lucky sale never raises a budget.
// Every threshold is a named setting a merchant can override.

export const AD_RULE_DEFAULTS = {
  // Pause an ad whose cost per click is over `maxCpcCents` after this many
  // clicks.
  cpcMinClicks: 10,
  // Pause an ad whose click-through rate is under `minCtr` after this many
  // impressions.
  ctrMinImpressions: 1000,
  // Pause an ad with add-to-carts but no purchase once it has spent this
  // many target CPAs.
  killCartNoSaleCpaMultiple: 2,
  // Pause an ad with no purchase and no add-to-cart once it has spent this
  // many target CPAs.
  killNoSaleCpaMultiple: 1,
  // Stop every campaign once total ad spend minus the profit of its sales
  // reaches this, in US cents.
  lossLimitCents: 5000,
  // The cost-per-click cap, in US cents.
  maxCpcCents: 150,
  // The click-through-rate floor.
  minCtr: 0.008,
  // Hours between two raises of one campaign.
  scaleEveryHours: 48,
  // A raise needs at least this many purchases.
  scaleMinPurchases: 3,
  // A raise needs ROAS of at least break-even ROAS times this.
  scaleRoasMultiple: 1.3,
  // The most a raise adds to a daily budget, as a share of it.
  scaleStep: 0.2,
} as const;

export type AdRuleSettings = {
  -readonly [K in keyof typeof AD_RULE_DEFAULTS]: number;
};

// A merchant's overrides, as saved: any subset of the settings.
export const adRuleOverridesSchema = z
  .object({
    cpcMinClicks: z.number().int().min(1).max(10_000),
    ctrMinImpressions: z.number().int().min(100).max(1_000_000),
    killCartNoSaleCpaMultiple: z.number().min(0.5).max(10),
    killNoSaleCpaMultiple: z.number().min(0.5).max(10),
    lossLimitCents: z.number().int().min(0).max(10_000_000),
    maxCpcCents: z.number().int().min(1).max(10_000),
    minCtr: z.number().min(0).max(0.2),
    scaleEveryHours: z
      .number()
      .min(24)
      .max(24 * 30),
    scaleMinPurchases: z.number().int().min(1).max(1000),
    scaleRoasMultiple: z.number().min(1).max(10),
    scaleStep: z.number().min(0.01).max(0.5),
  })
  .partial();
export type AdRuleOverrides = z.infer<typeof adRuleOverridesSchema>;

export const adRuleSettingsOf = (overrides: unknown): AdRuleSettings => {
  // An invalid override set falls back to the defaults as a whole.
  const parsed = adRuleOverridesSchema.safeParse(overrides ?? {});
  const set = Object.entries(parsed.success ? parsed.data : {}).filter(
    (entry): entry is [string, number] => entry[1] !== undefined
  );
  return { ...AD_RULE_DEFAULTS, ...Object.fromEntries(set) };
};

// What one sale of the campaign's product is worth to the merchant.
export interface UnitEconomics {
  priceCents: number;
  // Profit per sale after the blank, fees and the refund reserve.
  profitCents: number;
}

export interface Targets {
  // The most a purchase may cost without losing money: the profit per sale.
  targetCpaCents: number;
  // Revenue per dollar of spend at which a sale just pays for its ads.
  breakEvenRoas: number;
  // The ROAS a raise needs.
  scaleRoas: number;
}

export const targetsOf = (
  economics: UnitEconomics,
  settings: AdRuleSettings
): Targets | undefined => {
  if (economics.profitCents <= 0 || economics.priceCents <= 0) {
    return undefined;
  }
  const breakEvenRoas = economics.priceCents / economics.profitCents;
  return {
    breakEvenRoas,
    scaleRoas: breakEvenRoas * settings.scaleRoasMultiple,
    targetCpaCents: economics.profitCents,
  };
};

// One ad's lifetime results on Meta.
export interface AdResults {
  adId: string;
  active: boolean;
  addToCarts: number;
  clicks: number;
  impressions: number;
  purchases: number;
  spendCents: number;
}

export type KillRule =
  | "no_sale_spend"
  | "cart_no_sale_spend"
  | "low_ctr"
  | "high_cpc";

export interface Kill {
  adId: string;
  rule: KillRule;
  reason: string;
  numbers: Record<string, number>;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pct = (share: number) => `${(share * 100).toFixed(2)}%`;

// The first kill rule an ad breaks, if any.
export const killOf = (
  ad: AdResults,
  targets: Targets,
  settings: AdRuleSettings
): Kill | undefined => {
  const cpa = targets.targetCpaCents;
  if (ad.purchases === 0 && ad.addToCarts === 0) {
    const limit = cpa * settings.killNoSaleCpaMultiple;
    if (ad.spendCents >= limit) {
      return {
        adId: ad.adId,
        numbers: {
          limitCents: limit,
          spendCents: ad.spendCents,
          targetCpaCents: cpa,
        },
        reason: `Spent ${dollars(ad.spendCents)} with no sale and no add-to-cart; the limit is ${dollars(limit)} (${settings.killNoSaleCpaMultiple}x the ${dollars(cpa)} profit per sale).`,
        rule: "no_sale_spend",
      };
    }
  }
  if (ad.purchases === 0 && ad.addToCarts > 0) {
    const limit = cpa * settings.killCartNoSaleCpaMultiple;
    if (ad.spendCents >= limit) {
      return {
        adId: ad.adId,
        numbers: {
          addToCarts: ad.addToCarts,
          limitCents: limit,
          spendCents: ad.spendCents,
          targetCpaCents: cpa,
        },
        reason: `Spent ${dollars(ad.spendCents)} with ${ad.addToCarts} add-to-carts but no sale; the limit is ${dollars(limit)} (${settings.killCartNoSaleCpaMultiple}x the ${dollars(cpa)} profit per sale).`,
        rule: "cart_no_sale_spend",
      };
    }
  }
  if (ad.impressions >= settings.ctrMinImpressions) {
    const ctr = ad.clicks / ad.impressions;
    if (ctr < settings.minCtr) {
      return {
        adId: ad.adId,
        numbers: {
          clicks: ad.clicks,
          ctr,
          impressions: ad.impressions,
          minCtr: settings.minCtr,
        },
        reason: `Click-through rate ${pct(ctr)} after ${ad.impressions} impressions, under the ${pct(settings.minCtr)} floor.`,
        rule: "low_ctr",
      };
    }
  }
  if (ad.clicks >= settings.cpcMinClicks && ad.clicks > 0) {
    const cpc = ad.spendCents / ad.clicks;
    if (cpc > settings.maxCpcCents) {
      return {
        adId: ad.adId,
        numbers: {
          clicks: ad.clicks,
          cpcCents: cpc,
          maxCpcCents: settings.maxCpcCents,
        },
        reason: `Cost per click ${dollars(cpc)} after ${ad.clicks} clicks, over the ${dollars(settings.maxCpcCents)} cap.`,
        rule: "high_cpc",
      };
    }
  }
  return undefined;
};

export interface CampaignResults {
  campaignId: string;
  live: boolean;
  dailyBudgetCents: number;
  ads: AdResults[];
  economics: UnitEconomics;
  // A test campaign's ads, each judged on its own design's product; the
  // campaign's economics otherwise.
  economicsByAd?: ReadonlyMap<string, UnitEconomics> | undefined;
  // The ad set is learning (./optimizer learningReasons).
  learning: boolean;
  // wovain's last raise of this campaign's budget.
  lastScaleAt?: Date | undefined;
}

export type CampaignDecision =
  // Pause these ads; others keep running.
  | { kind: "pause_ads"; kills: Kill[] }
  // Every active ad broke a rule, or the product makes no profit.
  | { kind: "pause_campaign"; kills: Kill[]; reason: string }
  | {
      kind: "scale";
      fromCents: number;
      toCents: number;
      reason: string;
      numbers: Record<string, number>;
    }
  | { kind: "hold"; why: string; numbers?: Record<string, number> };

export interface CampaignTotals {
  addToCarts: number;
  clicks: number;
  impressions: number;
  purchases: number;
  revenueCents: number;
  spendCents: number;
}

export const totalsOf = (
  ads: readonly AdResults[],
  economics: UnitEconomics
): CampaignTotals => {
  const sum = (pick: (ad: AdResults) => number) =>
    ads.reduce((total, ad) => total + pick(ad), 0);
  const purchases = sum((ad) => ad.purchases);
  return {
    addToCarts: sum((ad) => ad.addToCarts),
    clicks: sum((ad) => ad.clicks),
    impressions: sum((ad) => ad.impressions),
    purchases,
    revenueCents: purchases * economics.priceCents,
    spendCents: sum((ad) => ad.spendCents),
  };
};

const HOUR_MS = 3_600_000;

const scaleOf = (
  results: CampaignResults,
  targets: Targets,
  settings: AdRuleSettings,
  { now, roomCents }: { now: Date; roomCents: number }
): CampaignDecision => {
  const totals = totalsOf(results.ads, results.economics);
  const roas =
    totals.spendCents > 0 ? totals.revenueCents / totals.spendCents : 0;
  const numbers = {
    purchases: totals.purchases,
    roas,
    scaleRoas: targets.scaleRoas,
    spendCents: totals.spendCents,
  };
  if (results.learning) {
    return {
      kind: "hold",
      numbers,
      why: "The ad set is still learning: no raise.",
    };
  }
  if (totals.purchases < settings.scaleMinPurchases) {
    return {
      kind: "hold",
      numbers,
      why: `${totals.purchases} purchases, under the ${settings.scaleMinPurchases} a raise needs.`,
    };
  }
  if (roas < targets.scaleRoas) {
    return {
      kind: "hold",
      numbers,
      why: `ROAS ${roas.toFixed(2)}, under the ${targets.scaleRoas.toFixed(2)} a raise needs.`,
    };
  }
  if (
    results.lastScaleAt !== undefined &&
    now.getTime() - results.lastScaleAt.getTime() <
      settings.scaleEveryHours * HOUR_MS
  ) {
    return {
      kind: "hold",
      numbers,
      why: `Raised less than ${settings.scaleEveryHours} hours ago.`,
    };
  }
  const from = results.dailyBudgetCents;
  const to = Math.min(
    Math.round(from * (1 + settings.scaleStep)),
    from + Math.max(0, roomCents)
  );
  if (to <= from) {
    return {
      kind: "hold",
      numbers,
      why: "The daily cap leaves no room to raise.",
    };
  }
  return {
    fromCents: from,
    kind: "scale",
    numbers: { ...numbers, fromCents: from, toCents: to },
    reason: `ROAS ${roas.toFixed(2)} on ${totals.purchases} purchases beats the ${targets.scaleRoas.toFixed(2)} target (${settings.scaleRoasMultiple}x break-even ${targets.breakEvenRoas.toFixed(2)}).`,
    toCents: to,
  };
};

// The kill rules, then the scale rule, for one campaign. `roomCents` is how
// far the campaign's daily budget may rise before the merchant's daily cap.
export const decideCampaign = (
  results: CampaignResults,
  settings: AdRuleSettings,
  { now, roomCents }: { now: Date; roomCents: number }
): CampaignDecision => {
  if (!results.live) {
    return { kind: "hold", why: "The campaign isn't running on Meta." };
  }
  const targets = targetsOf(results.economics, settings);
  const active = results.ads.filter((ad) => ad.active);
  if (targets === undefined) {
    return {
      kills: [],
      kind: "pause_campaign",
      reason: `A sale at ${dollars(results.economics.priceCents)} leaves no profit (${dollars(results.economics.profitCents)}), so every ad dollar is lost.`,
    };
  }
  const kills = active.flatMap((ad) => {
    const own = results.economicsByAd?.get(ad.adId);
    const adTargets =
      own === undefined ? targets : (targetsOf(own, settings) ?? targets);
    const kill = killOf(ad, adTargets, settings);
    return kill === undefined ? [] : [kill];
  });
  if (active.length > 0 && kills.length === active.length) {
    return {
      kills,
      kind: "pause_campaign",
      reason: "Every running ad broke a kill rule.",
    };
  }
  if (kills.length > 0) {
    return { kills, kind: "pause_ads" };
  }
  return scaleOf(results, targets, settings, { now, roomCents });
};

// Spend across all of the merchant's wovain campaigns.
export interface MerchantSpend {
  todayCents: number;
  monthCents: number;
  // Lifetime spend and the profit of lifetime sales.
  totalSpendCents: number;
  totalProfitCents: number;
}

export type StopReason = "daily_cap" | "monthly_cap" | "loss_limit";

export interface Stop {
  reason: StopReason;
  text: string;
  numbers: Record<string, number>;
}

// Whether every campaign must stop now: a spend cap reached, or losses at
// the merchant's limit. Caps of 0 mean no spend at all.
export const stopOf = (
  spend: MerchantSpend,
  caps: { dailySpendCapCents: number; monthlySpendCapCents: number },
  settings: AdRuleSettings
): Stop | undefined => {
  const loss = spend.totalSpendCents - spend.totalProfitCents;
  if (spend.totalSpendCents > 0 && loss >= settings.lossLimitCents) {
    return {
      numbers: {
        lossCents: loss,
        lossLimitCents: settings.lossLimitCents,
        profitCents: spend.totalProfitCents,
        spendCents: spend.totalSpendCents,
      },
      reason: "loss_limit",
      text: `Ads spent ${dollars(spend.totalSpendCents)} and sales made ${dollars(spend.totalProfitCents)} profit: a ${dollars(loss)} loss, at your ${dollars(settings.lossLimitCents)} limit.`,
    };
  }
  if (spend.todayCents > 0 && spend.todayCents >= caps.dailySpendCapCents) {
    return {
      numbers: {
        capCents: caps.dailySpendCapCents,
        spendCents: spend.todayCents,
      },
      reason: "daily_cap",
      text: `Spent ${dollars(spend.todayCents)} today, at your ${dollars(caps.dailySpendCapCents)} daily cap.`,
    };
  }
  if (spend.monthCents > 0 && spend.monthCents >= caps.monthlySpendCapCents) {
    return {
      numbers: {
        capCents: caps.monthlySpendCapCents,
        spendCents: spend.monthCents,
      },
      reason: "monthly_cap",
      text: `Spent ${dollars(spend.monthCents)} this month, at your ${dollars(caps.monthlySpendCapCents)} monthly cap.`,
    };
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// A test campaign, design by design (openspec ads-design-test)

export interface DesignSlice {
  // The caller's id for the design (its product).
  key: string;
  adIds: readonly string[];
  economics: UnitEconomics;
}

export type DesignStatus =
  // Every design keeps spending until the rules can judge it.
  | { state: "testing" }
  // Every ad of the design is off: why, in the rule's words.
  | { state: "paused"; reason: string }
  // The most profitable design with a sale.
  | { state: "winner" };

export interface DesignResult extends CampaignTotals {
  key: string;
  // Clicks over impressions, 0 to 1; 0 before any impression.
  ctr: number;
  // Purchases times the profit per sale, minus spend.
  profitCents: number;
  status: DesignStatus;
}

const PAUSED_ON_META = "Paused on Meta.";

const statusOfDesign = (
  ads: readonly AdResults[],
  slice: DesignSlice,
  settings: AdRuleSettings
): DesignStatus => {
  if (ads.length === 0 || ads.some((ad) => ad.active)) {
    return { state: "testing" };
  }
  const targets = targetsOf(slice.economics, settings);
  if (targets === undefined) {
    return {
      reason: `A sale at ${dollars(slice.economics.priceCents)} leaves no profit.`,
      state: "paused",
    };
  }
  const reasons = ads.flatMap((ad) => {
    const kill = killOf(ad, targets, settings);
    return kill === undefined ? [] : [kill.reason];
  });
  return { reason: reasons[0] ?? PAUSED_ON_META, state: "paused" };
};

// Each design's results and where the rules have it: testing, paused (and
// why), or the winner the scale rule grows.
export const designResultsOf = (
  ads: readonly AdResults[],
  designs: readonly DesignSlice[],
  settings: AdRuleSettings
): DesignResult[] => {
  const byId = new Map(ads.map((ad) => [ad.adId, ad]));
  const results = designs.map((slice) => {
    const own = slice.adIds.flatMap((id) => {
      const ad = byId.get(id);
      return ad === undefined ? [] : [ad];
    });
    const totals = totalsOf(own, slice.economics);
    return {
      ...totals,
      ctr: totals.impressions === 0 ? 0 : totals.clicks / totals.impressions,
      key: slice.key,
      profitCents:
        totals.purchases * slice.economics.profitCents - totals.spendCents,
      status: statusOfDesign(own, slice, settings),
    };
  });
  const contenders = results.filter(
    (result) =>
      result.purchases > 0 &&
      result.profitCents > 0 &&
      result.status.state !== "paused"
  );
  const [best] = contenders.toSorted((a, b) => b.profitCents - a.profitCents);
  return results.map((result) =>
    best !== undefined && result.key === best.key
      ? { ...result, status: { state: "winner" as const } }
      : result
  );
};
