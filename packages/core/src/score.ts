// An idea's score from its signals. SCORE_WEIGHTS are the defaults; the
// feedback loop (./feedback) re-fits them per merchant from real sales and
// ad results, around these defaults. Code ranks ideas; no model does.

export interface IdeaSignals {
  // Qloo affinity of the theme with the seed's fans (0..1).
  affinity?: number | undefined;
  // 0 when the theme names a brand, artist or title Qloo matched.
  ipSafety: number;
  // Competitor prices against wovain's price floor (0..1).
  margin: number;
  marketHits: number;
  newsHits: number;
  // How fresh this week's headlines are (0..1).
  recency: number;
  // Tavily's mean relevance across results (0..1).
  relevance: number;
}

export const SCORE_WEIGHTS = {
  demand: 0.3,
  ipSafety: 0.1,
  margin: 0.1,
  momentum: 0.2,
  openness: 0.1,
  recency: 0.1,
  relevance: 0.1,
} as const;

export type ScoreTerm = keyof typeof SCORE_WEIGHTS;
export type ScoreWeights = Record<ScoreTerm, number>;
export const SCORE_TERMS = Object.keys(SCORE_WEIGHTS) as ScoreTerm[];

const DAY_MS = 86_400_000;
const NEUTRAL = 0.5;

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
export const marginOf = (price: number | undefined, floor: number) =>
  price === undefined || floor <= 0
    ? NEUTRAL
    : unit(NEUTRAL + (price - floor) / floor);

// 1 for today's headlines, 0 for a week old or undated.
export const recencyOf = (dates: (string | undefined)[], now = Date.now()) =>
  mean(
    dates.flatMap((date) => {
      const time = date === undefined ? Number.NaN : Date.parse(date);
      return Number.isNaN(time) ? [] : [unit(1 - (now - time) / (7 * DAY_MS))];
    })
  );

export const ipSafetyOf = (theme: string, names: string[]) => {
  const lowered = theme.toLowerCase();
  return names.some(
    (name) => name.length > 2 && lowered.includes(name.toLowerCase())
  )
    ? 0
    : 1;
};

// Each term of the score, 0 to 1, before its weight.
export const scoreFeatures = (signals: IdeaSignals): ScoreWeights => ({
  demand: unit(signals.affinity ?? NEUTRAL),
  ipSafety: unit(signals.ipSafety),
  margin: unit(signals.margin),
  momentum: unit(signals.newsHits / 5),
  openness: 1 - unit(signals.marketHits / 10),
  recency: unit(signals.recency),
  relevance: unit(signals.relevance),
});

export const scoreIdea = (
  signals: IdeaSignals,
  weights: ScoreWeights = SCORE_WEIGHTS
) => {
  const features = scoreFeatures(signals);
  const score = SCORE_TERMS.reduce(
    (total, term) => total + weights[term] * features[term],
    0
  );
  return Math.round(score * 1000) / 1000;
};
