import { z } from "zod";

import type { Logger } from "./log";
import type { Nemotron } from "./nemotron";

// The ads optimizer (openspec ads-optimizer): a Beta-Bernoulli
// Thompson-sampling bandit over the ads of one wovain campaign (one ad set,
// two or three ads, link clicks per impression), and the guards that keep
// its proposals safe:
// - Meta's learning phase is a floor: no edit while the ad set learns.
// - The breakdown effect: ads in one ad set are judged at the ad set level,
//   so the ad Meta delivers most is never paused and an ad with little
//   delivery is never judged.
// - Spend caps are hard limits: a raise never takes wovain's total daily
//   budget past the merchant's daily cap.
// At most one change per campaign per run, since each one restarts
// learning.
//
// The learning-phase and breakdown-effect rules are adapted from
// meta-ads-analyzer (skill/references/learning_phase.md and
// breakdown_effect.md), MIT License, Copyright (c) 2026 Mathias Chu:
// https://github.com/mathiaschu/meta-ads-analyzer

export const OPTIMIZER_RULES = {
  // The most a budget moves in one change, as a share of the budget.
  budgetStep: 0.2,
  // The click-through rate a traffic campaign should beat (about 0.9% for
  // Meta traffic campaigns).
  ctrFloor: 0.009,
  // Joint posterior draws behind each probability.
  draws: 4000,
  // Meta's learning phase: about 50 results within 7 days of the last
  // significant edit.
  learningDays: 7,
  learningResults: 50,
  // Lower the budget when the chance the rate beats the floor is under this.
  lowerBelow: 0.1,
  // The lowest daily budget wovain sets, in cents (Meta's floor is $1).
  minBudgetCents: 100,
  // An ad needs this many impressions of its own before it is judged.
  minImpressionsToJudge: 1000,
  // Pause an ad whose chance of being the best is below this.
  pauseBelow: 0.05,
  // Raise the budget when the chance the rate beats the floor is over this.
  raiseAbove: 0.9,
} as const;

const DAY_MS = 86_400_000;

export type Rng = () => number;

// Standard normal draw (Box-Muller).
const normal = (rng: Rng) => {
  const u = Math.max(rng(), Number.MIN_VALUE);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

// Gamma(shape, 1) draw: Marsaglia and Tsang (2000), with the shape < 1
// boost.
const gamma = (shape: number, rng: Rng): number => {
  if (shape < 1) {
    return gamma(shape + 1, rng) * rng() ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng);
    const v = (1 + c * x) ** 3;
    if (v > 0) {
      const u = rng();
      if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) {
        return d * v;
      }
    }
  }
};

export const sampleBeta = (alpha: number, beta: number, rng: Rng) => {
  const x = gamma(alpha, rng);
  return x / (x + gamma(beta, rng));
};

export interface Posterior {
  alpha: number;
  beta: number;
}

// Beta(1, 1) updated with clicks out of impressions.
export const posteriorOf = (clicks: number, impressions: number): Posterior => {
  const hits = Math.max(0, Math.min(clicks, impressions));
  return { alpha: 1 + hits, beta: 1 + Math.max(0, impressions - hits) };
};

// Each arm's chance of being the best: the share of joint draws it wins.
export const probabilityBest = (
  arms: readonly Posterior[],
  rng: Rng,
  draws: number = OPTIMIZER_RULES.draws
): number[] => {
  const wins = arms.map(() => 0);
  if (arms.length === 0) {
    return wins;
  }
  for (let draw = 0; draw < draws; draw += 1) {
    let best = 0;
    let bestValue = -1;
    for (const [index, arm] of arms.entries()) {
      const value = sampleBeta(arm.alpha, arm.beta, rng);
      if (value > bestValue) {
        best = index;
        bestValue = value;
      }
    }
    wins[best] = (wins[best] ?? 0) + 1;
  }
  return wins.map((count) => count / draws);
};

// The chance a posterior's rate is above `floor`.
export const probabilityAbove = (
  arm: Posterior,
  floor: number,
  rng: Rng,
  draws: number = OPTIMIZER_RULES.draws
) => {
  let above = 0;
  for (let draw = 0; draw < draws; draw += 1) {
    if (sampleBeta(arm.alpha, arm.beta, rng) > floor) {
      above += 1;
    }
  }
  return above / draws;
};

// A seeded RNG (Park-Miller minimal standard), so a run's draws can be
// replayed.
const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;
export const seededRng = (seed: number): Rng => {
  let state = Math.abs(Math.trunc(seed)) % MODULUS || 1;
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return state / MODULUS;
  };
};

export interface AdStats {
  adId: string;
  // Lifetime counts.
  clicks: number;
  impressions: number;
  spendCents: number;
  // Delivering on Meta (effective status ACTIVE).
  active: boolean;
}

export type MetaLearning = "learning" | "learning_limited" | "success";

export interface CampaignState {
  // The campaign is active on Meta (the merchant started it).
  live: boolean;
  dailyBudgetCents: number;
  adSetId: string;
  ads: AdStats[];
  // Meta's own learning stage, when the MCP returns it.
  metaLearning?: MetaLearning | undefined;
  // The ad set's results (link clicks) over the last 7 days.
  resultsLast7d: number;
  // wovain's last significant edit of this ad set.
  lastEditAt?: Date | undefined;
}

export interface Limits {
  dailySpendCapCents: number;
  // The daily budgets of the merchant's other wovain campaigns.
  otherBudgetsCents: number;
}

export type Proposal =
  | {
      type: "media.ad.pause";
      adId: string;
      probabilityBest: number;
      reason: string;
    }
  | {
      type: "media.budget.change";
      fromCents: number;
      toCents: number;
      probabilityAboveFloor: number;
      reason: string;
    };

export type Hold =
  | "campaign_not_live"
  | "learning_phase"
  | "no_active_ads"
  | "no_change_warranted";

export interface AdScore {
  adId: string;
  posterior: Posterior;
  probabilityBest: number;
  // The ad's share of the ad set's spend, 0 to 1.
  spendShare: number;
  // Why the ad can't be paused, when it can't.
  protectedBy?: "most_delivery" | "too_little_delivery" | "last_active_ad";
}

export interface Assessment {
  scores: AdScore[];
  learning: { learning: boolean; why: string[] };
  proposal?: Proposal | undefined;
  hold?: Hold | undefined;
}

// Why the ad set counts as learning; empty when it doesn't.
export const learningReasons = (
  state: Pick<CampaignState, "lastEditAt" | "metaLearning" | "resultsLast7d">,
  now: Date
) => {
  const why: string[] = [];
  if (state.metaLearning === "learning") {
    why.push("Meta reports the ad set as learning");
  }
  if (
    state.metaLearning === undefined &&
    state.resultsLast7d < OPTIMIZER_RULES.learningResults
  ) {
    why.push(
      `${state.resultsLast7d} results in 7 days, under the ${OPTIMIZER_RULES.learningResults} that end learning`
    );
  }
  if (
    state.lastEditAt !== undefined &&
    now.getTime() - state.lastEditAt.getTime() <
      OPTIMIZER_RULES.learningDays * DAY_MS
  ) {
    why.push(
      `wovain edited the ad set on ${state.lastEditAt.toISOString().slice(0, 10)}, under ${OPTIMIZER_RULES.learningDays} days ago`
    );
  }
  return why;
};

const scoreAds = (ads: AdStats[], rng: Rng): AdScore[] => {
  const active = ads.filter((ad) => ad.active);
  const posteriors = active.map((ad) => posteriorOf(ad.clicks, ad.impressions));
  const best = probabilityBest(posteriors, rng);
  const spend = active.reduce((total, ad) => total + ad.spendCents, 0);
  const topSpend = Math.max(0, ...active.map((ad) => ad.spendCents));
  return active.map((ad, index) => {
    const score: AdScore = {
      adId: ad.adId,
      posterior: posteriors[index] ?? posteriorOf(0, 0),
      probabilityBest: best[index] ?? 0,
      spendShare: spend > 0 ? ad.spendCents / spend : 0,
    };
    if (active.length <= 1) {
      score.protectedBy = "last_active_ad";
    } else if (ad.spendCents === topSpend && topSpend > 0) {
      // Meta chose this ad on marginal cost: its average isn't the verdict.
      score.protectedBy = "most_delivery";
    } else if (ad.impressions < OPTIMIZER_RULES.minImpressionsToJudge) {
      score.protectedBy = "too_little_delivery";
    }
    return score;
  });
};

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

const pauseProposal = (scores: AdScore[]): Proposal | undefined => {
  const [candidate] = scores
    .filter(
      (score) =>
        score.protectedBy === undefined &&
        score.probabilityBest < OPTIMIZER_RULES.pauseBelow
    )
    .toSorted((a, b) => a.probabilityBest - b.probabilityBest);
  if (candidate === undefined) {
    return undefined;
  }
  return {
    adId: candidate.adId,
    probabilityBest: candidate.probabilityBest,
    reason: `Ad ${candidate.adId} has a ${percent(candidate.probabilityBest)} chance of being the best ad in its ad set after ${candidate.posterior.alpha + candidate.posterior.beta - 2} impressions.`,
    type: "media.ad.pause",
  };
};

const budgetProposal = (
  state: CampaignState,
  limits: Limits,
  rng: Rng
): Proposal | undefined => {
  const active = state.ads.filter((ad) => ad.active);
  const clicks = active.reduce((total, ad) => total + ad.clicks, 0);
  const impressions = active.reduce((total, ad) => total + ad.impressions, 0);
  const pooled = posteriorOf(clicks, impressions);
  const above = probabilityAbove(pooled, OPTIMIZER_RULES.ctrFloor, rng);
  const from = state.dailyBudgetCents;
  if (above > OPTIMIZER_RULES.raiseAbove) {
    // The hard limit: wovain's daily budgets together stay within the cap.
    const room = limits.dailySpendCapCents - limits.otherBudgetsCents;
    const to = Math.min(
      Math.round(from * (1 + OPTIMIZER_RULES.budgetStep)),
      room
    );
    if (to <= from) {
      return undefined;
    }
    return {
      fromCents: from,
      probabilityAboveFloor: above,
      reason: `The ad set's click-through rate is above ${percent(OPTIMIZER_RULES.ctrFloor)} with ${percent(above)} confidence; the raise stays within the daily cap.`,
      toCents: to,
      type: "media.budget.change",
    };
  }
  if (above < OPTIMIZER_RULES.lowerBelow) {
    const to = Math.max(
      OPTIMIZER_RULES.minBudgetCents,
      Math.round(from * (1 - OPTIMIZER_RULES.budgetStep))
    );
    if (to >= from) {
      return undefined;
    }
    return {
      fromCents: from,
      probabilityAboveFloor: above,
      reason: `The ad set's click-through rate is above ${percent(OPTIMIZER_RULES.ctrFloor)} with only ${percent(above)} confidence.`,
      toCents: to,
      type: "media.budget.change",
    };
  }
  return undefined;
};

// Scores a campaign's ads and proposes at most one change.
export const assessCampaign = (
  state: CampaignState,
  limits: Limits,
  { now, rng }: { now: Date; rng: Rng }
): Assessment => {
  const why = learningReasons(state, now);
  const learning = { learning: why.length > 0, why };
  const scores = scoreAds(state.ads, rng);
  if (!state.live) {
    return { hold: "campaign_not_live", learning, scores };
  }
  if (scores.length === 0) {
    return { hold: "no_active_ads", learning, scores };
  }
  if (learning.learning) {
    return { hold: "learning_phase", learning, scores };
  }
  const proposal = pauseProposal(scores) ?? budgetProposal(state, limits, rng);
  return proposal === undefined
    ? { hold: "no_change_warranted", learning, scores }
    : { learning, proposal, scores };
};

// The reasoning model's review of one proposal (openspec ads-optimizer):
// it can veto, and a veto drops the proposal.
export const reviewSchema = z.object({
  approve: z.boolean(),
  reason: z.string().min(1).max(500),
});
export type Review = z.infer<typeof reviewSchema>;

const REVIEW_SYSTEM = [
  "You review one change wovain's ads optimizer proposes on a merchant's Meta traffic campaign (print-on-demand apparel, link clicks, no purchase data).",
  "Approve only when the evidence supports it. Veto when:",
  "- the data is thin or the difference could be noise",
  "- the change judges an ad by its average while Meta gives it the most delivery (the breakdown effect)",
  "- the ad set may still be learning",
  "- a budget raise rests on clicks alone, which are not sales",
  "Answer with approve (true or false) and a one-sentence reason the merchant can read.",
].join("\n");

export const reviewProposal = async (
  ask: Nemotron,
  input: { proposal: Proposal; scores: AdScore[]; dailyBudgetCents: number },
  log?: Logger
): Promise<Review> =>
  await ask({
    log,
    name: "ads_optimizer_review",
    prompt: JSON.stringify(input),
    schema: reviewSchema,
    system: REVIEW_SYSTEM,
    temperature: 0,
  });
