import { SATURATED_AT } from "./competition";
import { PROVEN_REVIEWS } from "./demand";
import type { AdDemand, MarketDemand } from "./demand";

// Sweet-spot competition and an honest rank for ideas (openspec
// idea-evidence). A print-on-demand seller wants a niche that already sells
// but is not crowded: "high demand + low listings = opportunity, high
// demand + high listings = saturated", and saturation is "sellers vastly
// exceeding demand" (seller guides on Etsy and print-on-demand niche
// research; Merch Informer's competition checker reads the share of
// listings that sell against the listing count). So the idea's market is
// read as demand against supply, not as demand alone:
//
// - demand: shops keeping an ad running 14 days or more (twice at 30), the
//   marketplaces' bestseller badges and their reviews (log scale: a
//   thousand reviews is not a thousand sales signals);
// - supply: the near-identical listings already selling it, and every shop
//   advertising it now. A running ad is a competitor in Meta's auction
//   whatever its age; only its staying power is demand. The old rank also
//   counted every advertiser as demand, so a crowded theme scored twice.
// - a bonus for gaps: what the theme's Qloo audience likes that no listing
//   covers.
//
// Both extremes are dropped: no proof of demand (a guess) and a saturated
// market (too many near-identical listings, or so many advertisers that
// ads cost too much). Kept ideas rank by the Wilson score lower bound of
// demand's share of the market signals (Evan Miller, "How Not To Sort By
// Average Rating"): with few signals the bound is low, so thin evidence
// can't outrank a proven idea.

// A shop with an ad running this long counts once, twice at EVERGREEN.
const VALIDATED_WEIGHT = 1;
const EVERGREEN_WEIGHT = 2;
const BESTSELLER_WEIGHT = 1.5;
// Near-identical listings, of the marketplace results read, that make a
// theme saturated: the competition read's own threshold.
export const SATURATED_LISTINGS = SATURATED_AT;
// Shops advertising the theme now, of the 50 ads sampled, that make Meta's
// auction for it costly.
export const SATURATED_ADVERTISERS = 15;
// Below this demand-to-supply ratio, sellers outnumber the demand seen.
export const MIN_DEMAND_RATIO = 0.25;
// Each gap adds this much, up to MAX_GAPS gaps.
const GAP_BONUS = 0.1;
const MAX_GAPS = 3;
// 95% two-sided, as in Evan Miller's ranking.
const Z = 1.96;

export interface SweetSpotInput {
  ads?: AdDemand | undefined;
  // Audience cues no listing covers.
  gaps: number;
  // Near-identical marketplace listings; undefined when not read.
  listings?: number | undefined;
  market?: MarketDemand | undefined;
  // Qloo's affinity for the theme, 0 to 1; 0 or undefined when Qloo gave
  // nothing.
  qlooAffinity?: number | undefined;
}

// Why an idea is not shown.
export const DROP_REASONS = [
  "no_qloo_evidence",
  "no_demand_proof",
  "no_competition_read",
  "saturated",
  // Passed the gate, but its title and concept failed the grounding check
  // twice (./idea-words).
  "no_title",
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export interface SweetSpot {
  // Demand points: long-running ads, bestsellers, reviews.
  demand: number;
  gaps: number;
  // The Wilson lower bound of demand's share, 0 to 1.
  lower: number;
  // demand / supply; null with no supply (kept JSON-safe).
  ratio: number | null;
  // What the rank sorts on: lower x Qloo fit x the gap bonus.
  score: number;
  // Supply points: near-identical listings and advertisers.
  supply: number;
}

export type Verdict =
  | { kept: true; spot: SweetSpot }
  | { kept: false; reason: DropReason; spot?: SweetSpot | undefined };

export const demandPoints = (
  ads: AdDemand | undefined,
  market: MarketDemand | undefined
) =>
  (ads === undefined
    ? 0
    : ads.evergreen * EVERGREEN_WEIGHT +
      (ads.validated - ads.evergreen) * VALIDATED_WEIGHT) +
  (market === undefined
    ? 0
    : market.bestsellers * BESTSELLER_WEIGHT + Math.log10(1 + market.reviews));

export const supplyPoints = (listings: number, ads: AdDemand | undefined) =>
  listings + (ads?.advertisers ?? 0);

// Proof that it sells: a shop kept an ad two weeks, a listing is a
// bestseller, or the listings have PROVEN_REVIEWS reviews.
export const provenDemand = (
  ads: AdDemand | undefined,
  market: MarketDemand | undefined
) =>
  (ads?.validated ?? 0) > 0 ||
  (market?.bestsellers ?? 0) > 0 ||
  (market?.reviews ?? 0) >= PROVEN_REVIEWS;

// The Wilson score interval's lower bound for `positive` out of `total`
// (fractional counts allowed); 0 with no evidence.
export const wilsonLower = (positive: number, total: number, z = Z) => {
  if (total <= 0) {
    return 0;
  }
  const share = positive / total;
  const z2 = z * z;
  const centre = share + z2 / (2 * total);
  const spread =
    z * Math.sqrt((share * (1 - share) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - spread) / (1 + z2 / total));
};

export const sweetSpotOf = (input: SweetSpotInput): SweetSpot => {
  const demand = demandPoints(input.ads, input.market);
  const supply = supplyPoints(input.listings ?? 0, input.ads);
  const gaps = Math.min(Math.max(input.gaps, 0), MAX_GAPS);
  const lower = wilsonLower(demand, demand + supply);
  const fit = Math.min(Math.max(input.qlooAffinity ?? 0, 0), 1);
  return {
    demand,
    gaps: input.gaps,
    lower,
    ratio: supply === 0 ? null : demand / supply,
    score: lower * fit * (1 + GAP_BONUS * gaps),
    supply,
  };
};

// The gate, then the sweet spot: an idea is kept only with Qloo evidence,
// proof of demand and a competition read, and when its market is neither
// unproven nor saturated.
export const judgeIdea = (input: SweetSpotInput): Verdict => {
  if ((input.qlooAffinity ?? 0) <= 0) {
    return { kept: false, reason: "no_qloo_evidence" };
  }
  if (!provenDemand(input.ads, input.market)) {
    return { kept: false, reason: "no_demand_proof" };
  }
  if (input.listings === undefined) {
    return { kept: false, reason: "no_competition_read" };
  }
  const spot = sweetSpotOf(input);
  const saturated =
    input.listings >= SATURATED_LISTINGS ||
    (input.ads?.advertisers ?? 0) >= SATURATED_ADVERTISERS ||
    (spot.ratio !== null && spot.ratio < MIN_DEMAND_RATIO);
  return saturated
    ? { kept: false, reason: "saturated", spot }
    : { kept: true, spot };
};

export interface Judged<T> {
  dropped: { item: T; reason: DropReason; spot?: SweetSpot | undefined }[];
  // Best first; ties keep their order.
  kept: { item: T; spot: SweetSpot }[];
}

// Gates and ranks a list, best first, at most `limit` kept. Never pads: a
// short list stays short.
export const rankIdeas = <T>(
  items: readonly T[],
  inputOf: (item: T) => SweetSpotInput,
  limit = Number.POSITIVE_INFINITY
): Judged<T> => {
  const kept: Judged<T>["kept"] = [];
  const dropped: Judged<T>["dropped"] = [];
  for (const item of items) {
    const verdict = judgeIdea(inputOf(item));
    if (verdict.kept) {
      kept.push({ item, spot: verdict.spot });
    } else {
      dropped.push({ item, reason: verdict.reason, spot: verdict.spot });
    }
  }
  return {
    dropped,
    kept: kept
      .toSorted((first, second) => second.spot.score - first.spot.score)
      .slice(0, limit),
  };
};
