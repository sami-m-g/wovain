import type { IdeaSignals } from "@wovain/shared/trends";

// An idea's score: sales likelihood from signals, with fixed, exported
// weights so the formula stays transparent and real Fourthwall sales and
// Meta results can recalibrate it. No model ranks ideas.

export const SCORE_WEIGHTS = {
  // Qloo affinity, plus active Meta ads when the agent passed them.
  demand: 0.25,
  ipSafety: 0.1,
  // Competitor prices against the merchant's own price floor.
  margin: 0.1,
  // This week's news, discounted when Qloo's velocity doesn't confirm it.
  momentum: 0.2,
  // Few listings and few best sellers on Etsy, Redbubble and Fourthwall.
  openness: 0.15,
  recency: 0.1,
  // Tavily's per-result relevance.
  relevance: 0.1,
} as const;

const NEWS_FULL = 5;
const MARKET_FULL = 10;
const BEST_FULL = 3;
const ADS_FULL = 20;
const DAY_MS = 86_400_000;
// A theme the merchant already sells keeps half its score.
const OWN_PENALTY = 0.5;

const unit = (value: number) => Math.min(Math.max(value, 0), 1);

// News without a Qloo rise reads as hype: half credit. No Qloo velocity:
// three quarters.
const confirmation = (velocity: number | undefined) => {
  if (velocity === undefined) {
    return 0.75;
  }
  return velocity > 0 ? 1 : 0.5;
};

// 0.5 at parity; 1 when competitors charge half again the merchant's floor,
// 0 when they charge half of it. 0.5 without prices.
export const marginOf = (median?: number, floor?: number) =>
  median === undefined || floor === undefined || floor <= 0
    ? 0.5
    : unit(0.5 + (median - floor) / floor);

// How new the headlines are: 1 for today, 0 for a week old or undated.
export const recencyOf = (dates: string[], now = Date.now()) => {
  const ages = dates.flatMap((date) => {
    const time = Date.parse(date);
    return Number.isNaN(time) ? [] : [unit(1 - (now - time) / (7 * DAY_MS))];
  });
  return ages.length === 0
    ? 0
    : ages.reduce((sum, age) => sum + age, 0) / ages.length;
};

export const median = (values: number[]): number | undefined => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle];
  if (sorted.length % 2 === 1 || high === undefined) {
    return high;
  }
  return ((sorted[middle - 1] ?? high) + high) / 2;
};

export const scoreIdea = (signals: IdeaSignals) => {
  const fit = signals.affinity === undefined ? 0.5 : unit(signals.affinity);
  const demand =
    signals.activeAds === undefined
      ? fit
      : 0.7 * fit + 0.3 * unit(signals.activeAds / ADS_FULL);
  const momentum =
    unit(signals.newsHits / NEWS_FULL) * confirmation(signals.velocity);
  const openness =
    1 -
    unit(
      0.6 * (signals.marketHits / MARKET_FULL) +
        0.4 * (signals.bestSellers / BEST_FULL)
    );
  const w = SCORE_WEIGHTS;
  const score =
    w.demand * demand +
    w.ipSafety * unit(signals.ipSafety) +
    w.margin * unit(signals.margin) +
    w.momentum * momentum +
    w.openness * openness +
    w.recency * unit(signals.recency) +
    w.relevance * unit(signals.relevance);
  const own = signals.ownMatches > 0 ? OWN_PENALTY : 1;
  return Math.round(score * own * 1000) / 1000;
};
