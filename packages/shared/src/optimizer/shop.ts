import { breakeven, priceProduct } from "../economics.ts";
import type { SizeCost } from "../economics.ts";
import type { Settings } from "../settings.ts";
import type { CampaignFacts, DesignFacts } from "./facts.ts";
import { cpa } from "./math.ts";
import type { Confidence, Entity, Finding } from "./records.ts";

// The print-on-demand rules on economics, the campaign, seasons, the shop and
// measurement (spec section 4). Rule IDs are listed in pod.ts.

const DAY = 86_400_000;

const designEntity = (designId: string): Entity => ({
  id: designId,
  kind: "design",
});

const spendPerDayOf = (design: DesignFacts) =>
  design.ads.reduce((total, ad) => total + ad.spendPerDay, 0);

// POD-E1: profit per sale before ads, which is also break-even CPA.
export const breakevenPerSale = (
  price: number,
  baseCost: number,
  economics: Settings["economics"]
) => breakeven(price, baseCost, economics).perSale;

// POD-E3: the lowest price the pricing rule allows; a price change never goes under it.
export const priceFloor = (sizes: SizeCost[], settings: Settings) =>
  priceProduct(sizes, settings.pricing, settings.economics).price;

// POD-E2: the breakeven realized from the actual size mix. When it falls more
// than 10% under plan, a price change on the costlier sizes is offered.
export const sizeMix = (design: DesignFacts, settings: Settings): Finding[] => {
  const units = design.sizes.reduce((total, size) => total + size.units, 0);
  if (units === 0) {
    return [];
  }
  const realized = design.sizes.reduce(
    (total, size) =>
      total +
      (breakevenPerSale(design.price, size.baseCost, settings.economics) *
        size.units) /
        units,
    0
  );
  if (realized >= design.perSale * 0.9) {
    return [];
  }
  const cheapest = Math.min(...design.sizes.map((size) => size.baseCost));
  const costly = design.sizes.filter((size) => size.baseCost > cheapest);
  const suggested = priceFloor(costly, settings);
  return [
    {
      entity: designEntity(design.designId),
      evidence: [
        {
          label: "Planned breakeven",
          source: "computed",
          value: design.perSale,
        },
        { label: "Realized breakeven", source: "computed", value: realized },
      ],
      facts: {
        newPerSale: breakevenPerSale(
          Math.max(suggested, design.price),
          Math.max(...costly.map((size) => size.baseCost)),
          settings.economics
        ),
        price: design.price,
        realized,
        suggestedPrice: Math.max(suggested, design.price),
      },
      pattern: "size_mix_erodes_margin",
      rule: "POD-E2",
      settled: true,
    },
  ];
};

// POD-E4: a two-item bundle's profit per order: one shipping charge and one
// fixed card fee for both items.
export const bundle = (
  price: number,
  baseCost: number,
  economics: Settings["economics"],
  items = 2
) => {
  const single = breakeven(price, baseCost, economics);
  const fixedSaved = economics.cardFeeFixed * (items - 1);
  const shippingFeeSaved =
    economics.shipping * (economics.cardFeePct / 100) * (items - 1);
  return single.perSale * items + fixedSaved + shippingFeeSaved;
};

const campaignEntity = (id: string): Entity => ({ id, kind: "campaign" });

// POD-E4 (bundles) and POD-B1 (a capped winner), plus a campaign above
// breakeven with nothing to pause, on settled net sales.
export const campaignRules = (
  campaign: CampaignFacts,
  settings: Settings
): Finding[] => {
  const shopCpa = cpa(campaign.spend, campaign.netSales);
  const { rules } = settings;
  const entity = campaignEntity(campaign.campaignId);
  const findings: Finding[] = [];
  const evidence = [
    {
      label: "Net sales",
      source: "fourthwall" as const,
      value: campaign.netSales,
    },
    { label: "Spend", source: "meta" as const, value: campaign.spend },
  ];
  const inBundleRange =
    shopCpa !== undefined &&
    shopCpa >= campaign.perSale &&
    shopCpa <= campaign.perSale * 1.5;
  if (campaign.multiUnitOrders > 0 && inBundleRange) {
    findings.push({
      entity,
      evidence,
      facts: {
        bundlePerOrder: bundle(
          campaign.price,
          campaign.baseCost,
          settings.economics
        ),
        perSale: campaign.perSale,
      },
      pattern: "low_aov",
      rule: "POD-E4",
      settled: true,
    });
  }
  const capped = campaign.spendPerDay >= campaign.dailyBudget * 0.95;
  const winning =
    shopCpa !== undefined &&
    shopCpa < campaign.perSale * rules.scaleUnderMultiple &&
    campaign.netSales >= rules.scaleMinSales;
  if (capped && winning) {
    findings.push({
      entity,
      evidence,
      facts: {
        dailyBudget: campaign.dailyBudget,
        marginalCpa: shopCpa,
        perSale: campaign.perSale,
      },
      pattern: "winner_capped",
      rule: "POD-B1",
      settled: true,
    });
  }
  if (shopCpa !== undefined && shopCpa > campaign.perSale && !inBundleRange) {
    findings.push({
      entity,
      evidence,
      facts: {
        dailyBudget: campaign.dailyBudget,
        marginalCpa: shopCpa,
        perSale: campaign.perSale,
      },
      pattern: "over_breakeven",
      rule: "POD-E1",
      settled: true,
    });
  }
  return findings;
};

// POD-S1: seven days before the ship-by cutoff, scaling stops; after the
// season ends, the design is paused (with approval).
export const seasonal = (design: DesignFacts, now: number): Finding[] => {
  const { season } = design;
  if (season === undefined) {
    return [];
  }
  const entity = designEntity(design.designId);
  if (now > season.endsAt) {
    return [
      {
        entity,
        evidence: [
          { label: "Season ended", source: "wovain", value: season.endsAt },
        ],
        facts: { spendPerDay: spendPerDayOf(design) },
        pattern: "seasonal_end",
        rule: "POD-S1",
        settled: true,
      },
    ];
  }
  const cutoff = season.shipByAt ?? season.endsAt;
  return now >= cutoff - 7 * DAY
    ? [
        {
          entity,
          evidence: [
            { label: "Ship-by cutoff", source: "fourthwall", value: cutoff },
          ],
          facts: {},
          pattern: "seasonal_cutoff",
          rule: "POD-S1",
          settled: true,
        },
      ]
    : [];
};

// POD-S3: every design moved the same way past `threshold`, or a promotion
// ran: a shop-wide swing no single ad gets blamed for.
export const shopWide = (
  changes: number[],
  promotionActive: boolean,
  threshold = 0.3
): Finding[] => {
  const together =
    changes.length > 1 &&
    changes.every((value) => Math.abs(value) >= threshold) &&
    new Set(changes.map(Math.sign)).size === 1;
  return together || promotionActive
    ? [
        {
          entity: { id: "shop", kind: "shop" },
          evidence: [
            {
              label: "Promotion running",
              source: "fourthwall",
              value: promotionActive,
            },
          ],
          facts: {},
          pattern: "shop_wide",
          rule: "POD-S3",
          settled: true,
        },
      ]
    : [];
};

// POD-M1: a Meta dataset with no Conversions API events, or R1 failing, is a
// tracking gap: kills are blocked until it's fixed.
export const trackingGap = (
  capiEvents: number,
  purchasesCheckFailed: boolean
): Finding[] =>
  capiEvents === 0 || purchasesCheckFailed
    ? [
        {
          entity: { id: "shop", kind: "shop" },
          evidence: [
            { label: "CAPI events", source: "meta", value: capiEvents },
          ],
          facts: {},
          pattern: "tracking_gap",
          rule: "POD-M1",
          settled: true,
        },
      ]
    : [];

const order: Confidence[] = ["unknown", "low", "medium", "high"];
const atMost = (confidence: Confidence, cap: Confidence) =>
  order.indexOf(confidence) <= order.indexOf(cap) ? confidence : cap;
const stepDown = (confidence: Confidence): Confidence =>
  confidence === "unknown"
    ? confidence
    : (order[Math.max(1, order.indexOf(confidence) - 1)] ?? "low");

// Code's caps on the model's confidence: high needs settled data from both
// sources and R1 passing; a cold pixel or conversion cold start caps it at
// low; fewer than three sales caps it at medium (POD-E5); no ad-level UTM
// tags drop it a step (POD-M2); a falling niche caps kills at medium (POD-S4).
export const capConfidence = (
  confidence: Confidence,
  facts: {
    bothSettled: boolean;
    coldStart: boolean;
    isKill: boolean;
    netSales: number;
    nicheFalling: boolean;
    purchasesCheckPassed: boolean;
    tagUtmContent: boolean;
  }
): Confidence => {
  let capped = confidence;
  if (!(facts.bothSettled && facts.purchasesCheckPassed)) {
    capped = atMost(capped, "medium");
  }
  if (facts.netSales < 3) {
    capped = atMost(capped, "medium");
  }
  if (facts.isKill && facts.nicheFalling) {
    capped = atMost(capped, "medium");
  }
  if (facts.coldStart) {
    capped = atMost(capped, "low");
  }
  return facts.tagUtmContent ? capped : stepDown(capped);
};
