import type { Settings } from "../settings.ts";
import type { AdFacts, DesignFacts } from "./facts.ts";
import { cpa, ctr, hookRate, mean } from "./math.ts";
import type { Entity, Finding } from "./records.ts";
import { seasonal, sizeMix } from "./shop.ts";
import type { AdDayRow } from "./snapshot.ts";

// The print-on-demand rules (spec section 4, the wovain-pod-ads overlay) that
// run on ads and designs; shop.ts holds economics, the campaign, seasons and
// measurement, and ops.ts the operations rules. Each
// rule ID maps to the code that runs it or, for a guidance-only rule, the line
// the model's system prompt carries.
export const podRuleIds = {
  "POD-B1": "code: winnerCapped",
  "POD-C1": "code: fatigue",
  "POD-C2": "code: singleConcept",
  "POD-E1": "code: breakevenPerSale",
  "POD-E2": "code: sizeMix",
  "POD-E3": "code: priceFloor",
  "POD-E4": "code: bundle",
  "POD-E5": "code: capConfidence",
  "POD-E6": "code: contribution (math.ts) with ledger reversal costs",
  "POD-K1": "code: adKill",
  "POD-K2": "code: designKill",
  "POD-K3": "code: noClick",
  "POD-K4": "code: adKill (unsettled spend)",
  "POD-M1": "code: trackingGap",
  "POD-M2": "code: capConfidence (tagUtmContent)",
  "POD-M3": "code: missedSale",
  "POD-S1": "code: seasonal",
  "POD-S2": "code: fatigue baseline, isJudgeable",
  "POD-S3": "code: shopWide",
  "POD-S4": "code: capConfidence (niche falling)",
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Heuristics, not platform facts: an ad under 0.5% CTR "isn't clicked", and
// the first 48 hours of a drop are left out of fatigue baselines.
export const LOW_CTR = 0.005;
const DROP_WARMUP_MS = 48 * HOUR;

const adEntity = (adId: string): Entity => ({ id: adId, kind: "ad" });
const designEntity = (designId: string): Entity => ({
  id: designId,
  kind: "design",
});

const ctrOf = (ad: Pick<AdFacts, "clicks" | "impressions">) =>
  ctr(ad.clicks, ad.impressions);

// POD-K1 and POD-K4: one ad spent killNoSalesMultiple × breakeven with no net
// sale and no Meta purchase, while a sibling sold or its CTR is under half
// its siblings'. On unsettled data it's only an early warning.
export const adKill = (design: DesignFacts, settings: Settings): Finding[] => {
  const line = design.perSale * settings.rules.killNoSalesMultiple;
  return design.ads.flatMap((ad) => {
    const siblings = design.ads.filter((other) => other.adId !== ad.adId);
    const siblingSold = siblings.some((other) => other.netSales > 0);
    const siblingCtr = ctr(
      siblings.reduce((sum, other) => sum + other.clicks, 0),
      siblings.reduce((sum, other) => sum + other.impressions, 0)
    );
    const ownCtr = ctrOf(ad) ?? 0;
    const weak =
      siblingSold || (siblingCtr !== undefined && ownCtr < siblingCtr / 2);
    const noSale = ad.netSales === 0 && ad.metaPurchases === 0;
    if (!(ad.active && noSale && weak && ad.spend >= line)) {
      return [];
    }
    const settled = ad.settledSpend >= line;
    const activeSiblings = siblings.filter((other) => other.active).length;
    return [
      {
        entity: adEntity(ad.adId),
        evidence: [
          { label: "Spend", source: "meta", value: ad.spend },
          { label: "Kill line", source: "computed", value: line },
          { label: "Net sales", source: "fourthwall", value: ad.netSales },
        ],
        facts: {
          activeSiblings,
          perSale: design.perSale,
          spendPerDay: ad.spendPerDay,
        },
        pattern: settled ? "ad_no_sale" : "unsettled_spend",
        rule: settled ? "POD-K1" : "POD-K4",
        settled,
      },
    ];
  });
};

const sum = (ads: AdFacts[], key: "settledSpend" | "spend" | "spendPerDay") =>
  ads.reduce((total, ad) => total + ad[key], 0);

// POD-K2: the design's ads together spent killDesignMultiple × breakeven on
// settled data with no net sale, and shoppers visit the product: the product
// or price is the problem.
export const designKill = (
  design: DesignFacts,
  settings: Settings
): Finding[] => {
  const line = design.perSale * settings.rules.killDesignMultiple;
  const settledSpend = sum(design.ads, "settledSpend");
  const sales = design.ads.reduce((total, ad) => total + ad.netSales, 0);
  if (settledSpend < line || sales > 0 || design.productSessions === 0) {
    return [];
  }
  return [
    {
      entity: designEntity(design.designId),
      evidence: [
        { label: "Settled spend", source: "meta", value: settledSpend },
        { label: "Design kill line", source: "computed", value: line },
        {
          label: "Product sessions",
          source: "fourthwall",
          value: design.productSessions,
        },
      ],
      facts: { spendPerDay: sum(design.ads, "spendPerDay") },
      pattern: "clicks_no_sale",
      rule: "POD-K2",
      settled: true,
    },
  ];
};

// POD-K3: nobody clicks any of the design's ads and spend is under the design
// kill line, so the design isn't judged yet: a new creative, not a kill.
export const noClick = (design: DesignFacts, settings: Settings): Finding[] => {
  const line = design.perSale * settings.rules.killDesignMultiple;
  const live = design.ads.filter((ad) => ad.impressions > 0);
  const allLow =
    live.length > 0 && live.every((ad) => (ctrOf(ad) ?? 0) < LOW_CTR);
  if (!allLow || sum(design.ads, "spend") >= line) {
    return [];
  }
  return [
    {
      entity: designEntity(design.designId),
      evidence: live.map((ad) => ({
        label: `CTR ${ad.adId}`,
        source: "meta" as const,
        value: ctrOf(ad) ?? 0,
      })),
      facts: {},
      pattern: "no_click",
      rule: "POD-K3",
      settled: true,
    },
  ];
};

const seriesOf = (
  days: AdDayRow[],
  pick: (day: AdDayRow) => number | undefined
) => days.flatMap((day) => [pick(day)].filter((v) => v !== undefined));

const ctrOfDays = (days: AdDayRow[]) =>
  ctr(
    days.reduce((total, day) => total + day.clicks, 0),
    days.reduce((total, day) => total + day.impressions, 0)
  );
const hookOfDays = (days: AdDayRow[]) =>
  hookRate(
    days.reduce((total, day) => total + (day.plays3s ?? 0), 0),
    days.reduce((total, day) => total + day.impressions, 0)
  );
const freq = (days: AdDayRow[]) => mean(seriesOf(days, (day) => day.frequency));

// POD-S2: a drop is judged only after its conversion lag and its warm-up.
export const isJudgeable = (
  design: Pick<DesignFacts, "dropLaunchedAt">,
  now: number,
  settings: Settings
) =>
  design.dropLaunchedAt === undefined ||
  now - design.dropLaunchedAt >=
    settings.optimizer.conversionLagHours * HOUR + DROP_WARMUP_MS;

// POD-C1: from the ad's own series, never its age. CTR over the last three
// settled days under 70% of its first week, frequency up 30% or more, hook
// rate down, with at least one breakeven of spend in those days. A drop's
// first 48 hours stay out of the baseline (POD-S2).
export const fatigue = (
  design: DesignFacts,
  now: number,
  settings: Settings
): Finding[] => {
  const lagMs = settings.optimizer.conversionLagHours * HOUR;
  const warmupEnds = (design.dropLaunchedAt ?? 0) + DROP_WARMUP_MS;
  return design.ads.flatMap((ad) => {
    const settled = ad.days.filter((day) => now - day.at >= lagMs);
    const baseline = settled
      .filter((day) => Date.parse(day.date) + DAY > warmupEnds)
      .slice(0, 7);
    const recent = settled.slice(-3);
    if (baseline.length < 3 || recent.length < 3 || settled.length < 10) {
      return [];
    }
    const [ctrBefore, ctrNow] = [ctrOfDays(baseline), ctrOfDays(recent)];
    const [freqBefore, freqNow] = [freq(baseline), freq(recent)];
    const [hookBefore, hookNow] = [hookOfDays(baseline), hookOfDays(recent)];
    const recentSpend = recent.reduce((total, day) => total + day.spend, 0);
    const fatigued =
      ctrBefore !== undefined &&
      ctrNow !== undefined &&
      ctrNow < ctrBefore * 0.7 &&
      freqBefore !== undefined &&
      freqNow !== undefined &&
      freqNow >= freqBefore * 1.3 &&
      hookBefore !== undefined &&
      hookNow !== undefined &&
      hookNow < hookBefore &&
      recentSpend >= design.perSale;
    if (!fatigued) {
      return [];
    }
    return [
      {
        entity: adEntity(ad.adId),
        evidence: [
          { label: "First-week CTR", source: "meta", value: ctrBefore },
          { label: "Last 3 days CTR", source: "meta", value: ctrNow },
          { label: "Frequency now", source: "meta", value: freqNow },
          {
            label: "Meta flags fatigue",
            source: "meta",
            value: ad.metaFatigue === true,
          },
        ],
        facts: { ctrBefore, ctrNow, perSale: design.perSale },
        pattern: "creative_fatigue",
        rule: "POD-C1",
        settled: true,
      },
    ];
  });
};

// POD-C2: two clips of one hook are one concept. A design with a single
// concept gets a new one before any kill.
export const singleConcept = (design: DesignFacts): Finding[] => {
  const concepts = new Set(design.ads.map((ad) => ad.concept ?? ad.adId));
  return design.ads.length > 1 && concepts.size === 1
    ? [
        {
          entity: designEntity(design.designId),
          evidence: [{ label: "Concepts", source: "wovain", value: 1 }],
          facts: { concepts: 1 },
          pattern: "single_concept",
          rule: "POD-C2",
          settled: true,
        },
      ]
    : [];
};

// POD-M3: a paused ad with a net sale by UTM after its pause.
export const missedSale = (design: DesignFacts): Finding[] =>
  design.ads.flatMap((ad) =>
    ad.paused !== undefined && (ad.netSalesAfterPause ?? 0) > 0
      ? [
          {
            entity: adEntity(ad.adId),
            evidence: [
              {
                label: "Net sales after pause",
                source: "fourthwall" as const,
                value: ad.netSalesAfterPause ?? 0,
              },
            ],
            facts: {
              pausedByOptimizer: ad.paused.by === "optimizer" ? 1 : 0,
              perSale: design.perSale,
              shopCpa:
                cpa(ad.spend, ad.netSales + (ad.netSalesAfterPause ?? 0)) ?? 0,
              spendPerDay: ad.spendPerDay,
            },
            pattern: "missed_sale" as const,
            rule: "POD-M3",
            settled: true,
          },
        ]
      : []
  );

// The design rules in one pass (judged only once a drop has warmed up).
export const designFindings = (
  design: DesignFacts,
  now: number,
  settings: Settings
): Finding[] => [
  ...(isJudgeable(design, now, settings)
    ? [
        ...adKill(design, settings),
        ...designKill(design, settings),
        ...noClick(design, settings),
        ...fatigue(design, now, settings),
      ]
    : []),
  ...singleConcept(design),
  ...sizeMix(design, settings),
  ...seasonal(design, now),
  ...missedSale(design),
];
