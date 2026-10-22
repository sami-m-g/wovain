import type { IdeaSignals } from "@wovain/shared/trends";

// An idea's score from its signals, with fixed, exported weights so real
// sales can recalibrate it. No model ranks ideas.

export const SCORE_WEIGHTS = {
  // Qloo affinity, plus active Meta ads when the agent passed them.
  demand: 0.25,
  ipSafety: 0.1,
  // Competitor prices against the merchant's price floor.
  margin: 0.1,
  // This week's news, discounted when Qloo's velocity doesn't confirm it.
  momentum: 0.2,
  // Few listings and best sellers on the marketplaces.
  openness: 0.15,
  recency: 0.1,
  relevance: 0.1,
} as const;

const DAY_MS = 86_400_000;

const unit = (value: number) => Math.min(Math.max(value, 0), 1);

export const mean = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const median = (values: number[]): number | undefined => {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const high = sorted[middle];
  if (sorted.length % 2 === 1 || high === undefined) {
    return high;
  }
  return ((sorted[middle - 1] ?? high) + high) / 2;
};

// 0.5 at parity or without prices; 1 when competitors charge half again the
// floor, 0 when they charge half of it.
export const marginOf = (price?: number, floor?: number) =>
  price === undefined || floor === undefined || floor <= 0
    ? 0.5
    : unit(0.5 + (price - floor) / floor);

// 1 for today's headlines, 0 for a week old or undated.
export const recencyOf = (dates: string[], now = Date.now()) =>
  mean(
    dates.flatMap((date) => {
      const time = Date.parse(date);
      return Number.isNaN(time) ? [] : [unit(1 - (now - time) / (7 * DAY_MS))];
    })
  );

// News without a Qloo rise reads as hype: half credit; no velocity: 3/4.
const confirmation = (velocity: number | undefined) => {
  if (velocity === undefined) {
    return 0.75;
  }
  return velocity > 0 ? 1 : 0.5;
};

// 0 when the theme names a brand, artist or title Qloo matched; 0.5 when a
// top listing says it's officially licensed.
export const ipSafetyOf = (theme: string, names: string[], pages: string[]) => {
  const lowered = theme.toLowerCase();
  if (
    names.some(
      (name) => name.length > 2 && lowered.includes(name.toLowerCase())
    )
  ) {
    return 0;
  }
  return pages.some((page) => /officially licensed/iu.test(page)) ? 0.5 : 1;
};

export const scoreIdea = (signals: IdeaSignals) => {
  const fit = unit(signals.affinity ?? 0.5);
  const demand =
    signals.activeAds === undefined
      ? fit
      : 0.7 * fit + 0.3 * unit(signals.activeAds / 20);
  const momentum = unit(signals.newsHits / 5) * confirmation(signals.velocity);
  const crowding =
    0.6 * (signals.marketHits / 10) + 0.4 * (signals.bestSellers / 3);
  const w = SCORE_WEIGHTS;
  const score =
    w.demand * demand +
    w.ipSafety * unit(signals.ipSafety) +
    w.margin * unit(signals.margin) +
    w.momentum * momentum +
    w.openness * (1 - unit(crowding)) +
    w.recency * unit(signals.recency) +
    w.relevance * unit(signals.relevance);
  // A theme the merchant already sells keeps half its score.
  const own = signals.ownMatches > 0 ? 0.5 : 1;
  return Math.round(score * own * 1000) / 1000;
};
