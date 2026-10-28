import { mean, SCORE_TERMS, SCORE_WEIGHTS, scoreFeatures } from "./score";
import type { IdeaSignals, ScoreTerm, ScoreWeights } from "./score";

// The feedback loop: what an idea did once it was for sale (Fourthwall
// units and revenue, Meta clicks) becomes a reward, the rewards re-fit the
// merchant's score weights around the defaults, and the ideas that sold
// and the ones that didn't become learnings for taste memory and research.
// Pure functions; packages/api/src/flow/feedback.ts feeds them snapshots.

/** One idea's results, summed over its products and their ads. */
export interface IdeaOutcome {
  clicks: number;
  ideaId: string;
  impressions: number;
  revenueCents: number;
  /** The signals research scored the idea on. */
  signals: IdeaSignals;
  spendCents: number;
  theme: string;
  units: number;
}

/** A version of a merchant's score weights. Version 0 is the defaults. */
export interface WeightsVersion {
  samples: number;
  version: number;
  weights: ScoreWeights;
}

export interface WeightFit extends WeightsVersion {
  changed: boolean;
  /** Each term's correlation with the reward, -1 to 1. */
  correlations: ScoreWeights;
}

/** What sold and what didn't, as plain lines for taste memory and prompts. */
export interface Learnings {
  sold: string[];
  unsold: string[];
}

/** One idea's results, as numbers: the UI formats them in the reader's locale. */
export interface IdeaResult {
  /** Click-through rate, 0 to 1, once the ads had enough impressions. */
  ctr?: number | undefined;
  ideaId: string;
  revenueCents: number;
  theme: string;
  units: number;
}

/** What sold (most units first) and what didn't, as numbers. */
export interface LearnedResults {
  sold: IdeaResult[];
  unsold: IdeaResult[];
}

export const DEFAULT_WEIGHTS_VERSION: WeightsVersion = {
  samples: 0,
  version: 0,
  weights: { ...SCORE_WEIGHTS },
};

// Fewer counted ideas than this keep the defaults.
export const MIN_SAMPLES = 3;
// How far a weight may move from its default, as a share of it.
export const MAX_SHIFT = 0.5;
// Samples the prior is worth: confidence is n / (n + PRIOR_STRENGTH).
const PRIOR_STRENGTH = 10;
// A change smaller than this is not a new version.
const EPSILON = 0.001;
// Units at which sales reach 1 - 1/e of the reward.
const UNITS_SCALE = 3;
// A typical apparel feed CTR; twice it fills the ad part of the reward.
const BENCHMARK_CTR = 0.009;
// Below this many impressions a CTR says nothing yet.
const MIN_IMPRESSIONS = 500;
const SALES_SHARE = 0.7;
const SHOWN = 3;
const PROJECTIONS = 5;
const CENTS = 100;
const PERCENT = 100;

const unit = (value: number) => Math.min(Math.max(value, 0), 1);
const round = (value: number) => Math.round(value * 10_000) / 10_000;

export const ctrOf = ({ clicks, impressions }: IdeaOutcome) =>
  impressions > 0 ? clicks / impressions : undefined;

/** 0 to 1: units sold, plus the ads' CTR once they had enough impressions. */
export const rewardOf = (outcome: IdeaOutcome) => {
  const sales = 1 - Math.exp(-outcome.units / UNITS_SCALE);
  const ctr = ctrOf(outcome);
  if (ctr === undefined || outcome.impressions < MIN_IMPRESSIONS) {
    return sales;
  }
  const ads = unit(ctr / (2 * BENCHMARK_CTR));
  return SALES_SHARE * sales + (1 - SALES_SHARE) * ads;
};

const correlation = (xs: number[], ys: number[]) => {
  const mx = mean(xs);
  const my = mean(ys);
  let covariance = 0;
  let vx = 0;
  let vy = 0;
  for (const [index, x] of xs.entries()) {
    const dx = x - mx;
    const dy = (ys[index] ?? my) - my;
    covariance += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return vx === 0 || vy === 0 ? 0 : covariance / Math.sqrt(vx * vy);
};

const mapTerms = (value: (term: ScoreTerm) => number): ScoreWeights =>
  Object.fromEntries(
    SCORE_TERMS.map((term) => [term, value(term)])
  ) as ScoreWeights;

const normalised = (weights: ScoreWeights) => {
  const total = SCORE_TERMS.reduce((sum, term) => sum + weights[term], 0);
  return mapTerms((term) => weights[term] / total);
};

const bounded = (weights: ScoreWeights) =>
  normalised(
    mapTerms((term) => {
      const prior = SCORE_WEIGHTS[term];
      return Math.min(
        Math.max(weights[term], prior * (1 - MAX_SHIFT)),
        prior * (1 + MAX_SHIFT)
      );
    })
  );

// Normalise to sum 1 while keeping every weight within its bound.
const project = (weights: ScoreWeights) => {
  let current = normalised(weights);
  for (let pass = 0; pass < PROJECTIONS; pass += 1) {
    current = bounded(current);
  }
  return mapTerms((term) => round(current[term]));
};

/**
 * Re-fits the weights from all the merchant's outcomes, anchored on the
 * defaults: w = prior × (1 + MAX_SHIFT × confidence × correlation), then
 * normalised within the bounds. The version goes up only on a change.
 */
export const fitWeights = (
  outcomes: IdeaOutcome[],
  previous: WeightsVersion = DEFAULT_WEIGHTS_VERSION
): WeightFit => {
  const samples = outcomes.length;
  const rewards = outcomes.map(rewardOf);
  const features = outcomes.map((item) => scoreFeatures(item.signals));
  const correlations = mapTerms((term) =>
    samples < MIN_SAMPLES
      ? 0
      : round(
          correlation(
            features.map((item) => item[term]),
            rewards
          )
        )
  );
  const confidence = samples / (samples + PRIOR_STRENGTH);
  const weights =
    samples < MIN_SAMPLES
      ? { ...SCORE_WEIGHTS }
      : project(
          mapTerms(
            (term) =>
              SCORE_WEIGHTS[term] *
              (1 + MAX_SHIFT * confidence * correlations[term])
          )
        );
  const changed = SCORE_TERMS.some(
    (term) => Math.abs(weights[term] - previous.weights[term]) > EPSILON
  );
  return {
    changed,
    correlations,
    samples,
    version: changed ? previous.version + 1 : previous.version,
    weights: changed ? weights : previous.weights,
  };
};

const resultOf = (outcome: IdeaOutcome): IdeaResult => {
  const ctr = ctrOf(outcome);
  return {
    ...(ctr === undefined || outcome.impressions < MIN_IMPRESSIONS
      ? {}
      : { ctr: round(ctr) }),
    ideaId: outcome.ideaId,
    revenueCents: outcome.revenueCents,
    theme: outcome.theme,
    units: outcome.units,
  };
};

/** What sold (most units first) and what didn't, up to SHOWN of each. */
export const learnedOf = (outcomes: IdeaOutcome[]): LearnedResults => ({
  sold: outcomes
    .filter((item) => item.units > 0)
    .toSorted((a, b) => b.units - a.units || b.revenueCents - a.revenueCents)
    .slice(0, SHOWN)
    .map(resultOf),
  unsold: outcomes
    .filter((item) => item.units === 0)
    .slice(0, SHOWN)
    .map(resultOf),
});

// Taste memory and the research prompt are English, for the model; the UI
// formats IdeaResult itself, in the reader's language.
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(cents / CENTS);

const soldLine = (result: IdeaResult) => {
  const parts = [
    `${result.units} sold`,
    `${money(result.revenueCents)} revenue`,
    ...(result.ctr === undefined
      ? []
      : [`CTR ${round(result.ctr * PERCENT)}%`]),
  ];
  return `${result.theme}: ${parts.join(", ")}`;
};

/** The results as plain lines, for taste memory and the research prompt. */
export const learningsOf = (learned: LearnedResults): Learnings => ({
  sold: learned.sold.map(soldLine),
  unsold: learned.unsold.map((item) => `${item.theme}: no sales`),
});
