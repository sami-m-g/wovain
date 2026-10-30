import betaCdf from "@stdlib/stats-base-dists-beta-cdf";

// What sells for this merchant (openspec feedback-loop, "Outcomes per
// design"): every published design is one trial, a win when it made a
// profit (sales times the profit per sale, less its ad spend), and each of
// its angles (theme, Qloo tags and entities, audience, palette, price band,
// blank) learns from the trials it was part of. Pure functions;
// packages/mastra/src/mastra/flow/outcomes.ts records the rows and feeds them here.
//
// The method is Beta-Binomial with an empirical-Bayes prior:
// - Each angle's win rate has a Beta(κm, κ(1 − m)) prior, where m is the
//   merchant's own win rate and κ = ANGLE_PRIOR_STRENGTH designs, so an
//   angle seen once moves only a little from the merchant's average and
//   one with many designs speaks for itself (shrinkage). Its posterior after
//   k wins in n designs is Beta(κm + k, κ(1 − m) + n − k).
// - The merchant's rate m is itself shrunk to an anonymised global rate
//   (only counts across all merchants, never their angles) with
//   MERCHANT_PRIOR_STRENGTH designs of weight, so a new merchant starts at
//   the global rate.
// - An angle "wins" or "loses" in an explanation only when the posterior
//   probability that its rate beats the merchant's (1 − the Beta CDF at m,
//   from @stdlib/stats-base-dists-beta-cdf) is at least CONFIDENT, or at
//   most 1 − CONFIDENT.
// References: Gelman et al., Bayesian Data Analysis (3rd ed., 2013), §2.4
// and §5.3 (the Beta-Binomial model and hierarchical shrinkage); Efron and
// Morris, "Data analysis using Stein's estimator and its generalizations",
// JASA 70 (1975); D. Robinson, Introduction to Empirical Bayes (2017).
//
// Cost per sale uses the Gamma-Poisson analogue: the merchant's ad spend
// over purchases, with REAL_CPA_PRIOR_PURCHASES purchases at the profit per
// sale as the prior, so a few cheap sales never loosen or tighten the kill
// rules much.

export const ANGLE_KINDS = [
  "theme",
  "tag",
  "entity",
  "audience",
  "palette",
  "price",
  "blank",
] as const;
export type AngleKind = (typeof ANGLE_KINDS)[number];

/** What a design was made of: the angles it can teach. */
export interface OutcomeAttributes {
  audience?: string | null | undefined;
  blank?: string | null | undefined;
  palette?: string | null | undefined;
  priceCents?: number | null | undefined;
  qlooEntities?: readonly string[] | undefined;
  qlooTags?: readonly string[] | undefined;
  theme?: string | null | undefined;
}

/** One design's outcome, as recorded. */
export interface DesignOutcome extends OutcomeAttributes {
  addToCarts: number;
  clicks: number;
  dropId?: string | null | undefined;
  impressions: number;
  launchedAt: Date;
  productId: string;
  /** What one sale leaves after the blank, fees and the refund reserve. */
  profitPerSaleCents: number;
  /** Meta purchases (the pixel's). */
  purchases: number;
  revenueCents: number;
  /** Whether Fourthwall's sales were read from the day it launched. */
  salesCovered: boolean;
  spendCents: number;
  /** Fourthwall units sold. */
  units: number;
}

export interface AngleStats {
  /** Designs with this angle that have run long enough to count. */
  designs: number;
  /** Distinct drops among them (a design without a drop counts as one). */
  drops: number;
  kind: AngleKind;
  /** Posterior mean win rate over the merchant's: above 1 sells better. */
  lift: number;
  /** Posterior probability that its win rate beats the merchant's. */
  pBeat: number;
  /** Their profit, after ad spend; may be negative. */
  profitCents: number;
  /** The angle: "cottagecore", or a price band key such as "25-35". */
  value: string;
  wins: number;
}

export interface OutcomeModel {
  angles: AngleStats[];
  /** The merchant's shrunk win rate, the prior mean of every angle. */
  baseRate: number;
  /** Ad spend and Meta purchases over all designs, for the real CPA. */
  cost: { purchases: number; spendCents: number };
  designs: number;
  wins: number;
}

/** The anonymised rate across merchants: counts only. */
export interface GlobalPrior {
  designs: number;
  wins: number;
}

/** Why an idea scores as it does, for the UI to word in its language. */
export interface OutcomeWhy {
  direction: "up" | "down";
  drops: number;
  kind: AngleKind;
  profitCents: number;
  value: string;
}

export interface OutcomeScore {
  /** The strongest angles the idea shares with the merchant's record. */
  evidence: AngleStats[];
  /** Multiply the idea's rank by this: 1 is neutral. */
  multiplier: number;
  why?: OutcomeWhy | undefined;
}

// A design counts once it has been for sale this long.
export const MIN_LIVE_DAYS = 3;
// Designs the angle prior is worth.
export const ANGLE_PRIOR_STRENGTH = 8;
// Designs the global prior is worth to a merchant's base rate.
export const MERCHANT_PRIOR_STRENGTH = 10;
// The global rate is used once this many designs across merchants count;
// DEFAULT_RATE before.
export const GLOBAL_MIN_DESIGNS = 30;
// A typical share of print-on-demand designs that make a profit: a weak
// prior, quickly replaced by the global and the merchant's own rates.
export const DEFAULT_RATE = 0.2;
// The posterior probability an explanation needs.
export const CONFIDENT = 0.8;
// The score never moves a rank by more than this factor either way.
export const MAX_MULTIPLIER = 2;
// Purchases before the kill rules read the real cost per sale.
export const REAL_CPA_MIN_PURCHASES = 10;
// Purchases at the profit per sale the real CPA's prior is worth.
export const REAL_CPA_PRIOR_PURCHASES = 3;
// Each design keeps at least this share of an even floor in a test.
const EVEN_SHARE = 0.5;
// Angles kept as evidence for one idea.
const EVIDENCE = 3;

// Price bands in US cents, low edge inclusive. The label is a stable key
// the UI words in the reader's language.
const PRICE_BANDS = [
  { from: 0, label: "under-25", to: 2500 },
  { from: 2500, label: "25-35", to: 3500 },
  { from: 3500, label: "35-50", to: 5000 },
  { from: 5000, label: "50-up", to: Number.POSITIVE_INFINITY },
] as const;

const DAY_MS = 86_400_000;

export const priceBandOf = (cents: number) =>
  PRICE_BANDS.find((band) => cents >= band.from && cents < band.to)?.label ??
  PRICE_BANDS[0].label;

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

const keyOf = (kind: AngleKind, value: string) =>
  `${kind}:${value.toLowerCase()}`;

/** The angles a design or an idea has, one per kind and value. */
export const anglesOf = (
  attributes: OutcomeAttributes
): { kind: AngleKind; value: string }[] => {
  const found = new Map<string, { kind: AngleKind; value: string }>();
  const add = (kind: AngleKind, value: string | null | undefined) => {
    const shown = clean(value);
    if (shown !== undefined) {
      found.set(keyOf(kind, shown), { kind, value: shown });
    }
  };
  add("theme", attributes.theme);
  for (const tag of attributes.qlooTags ?? []) {
    add("tag", tag);
  }
  for (const entity of attributes.qlooEntities ?? []) {
    add("entity", entity);
  }
  add("audience", attributes.audience);
  add("palette", attributes.palette);
  if (
    attributes.priceCents !== null &&
    attributes.priceCents !== undefined &&
    attributes.priceCents > 0
  ) {
    add("price", priceBandOf(attributes.priceCents));
  }
  add("blank", attributes.blank);
  return [...found.values()];
};

/** Sales are Fourthwall's units when read from launch, Meta's otherwise. */
export const salesOf = (outcome: DesignOutcome) =>
  outcome.salesCovered ? outcome.units : outcome.purchases;

/** Profit after ad spend, in cents. */
export const profitOf = (outcome: DesignOutcome) =>
  salesOf(outcome) * outcome.profitPerSaleCents - outcome.spendCents;

/** A design counts once it has run MIN_LIVE_DAYS, or as soon as it wins. */
export const countsOf = (outcome: DesignOutcome, now: Date) =>
  profitOf(outcome) > 0 ||
  now.getTime() - outcome.launchedAt.getTime() >= MIN_LIVE_DAYS * DAY_MS;

/** The merchant's rate, shrunk to the global one (or DEFAULT_RATE). */
export const baseRateOf = (
  designs: number,
  wins: number,
  global?: GlobalPrior
) => {
  const prior =
    global !== undefined &&
    global.designs >= GLOBAL_MIN_DESIGNS &&
    global.wins > 0 &&
    global.wins < global.designs
      ? global.wins / global.designs
      : DEFAULT_RATE;
  return (
    (wins + MERCHANT_PRIOR_STRENGTH * prior) /
    (designs + MERCHANT_PRIOR_STRENGTH)
  );
};

const statsOf = (
  kind: AngleKind,
  value: string,
  members: DesignOutcome[],
  baseRate: number
): AngleStats => {
  const wins = members.filter((item) => profitOf(item) > 0).length;
  const alpha = ANGLE_PRIOR_STRENGTH * baseRate + wins;
  const beta = ANGLE_PRIOR_STRENGTH * (1 - baseRate) + members.length - wins;
  const mean = alpha / (alpha + beta);
  return {
    designs: members.length,
    drops: new Set(members.map((item) => item.dropId ?? item.productId)).size,
    kind,
    lift: mean / baseRate,
    pBeat: 1 - betaCdf(baseRate, alpha, beta),
    profitCents: members.reduce((sum, item) => sum + profitOf(item), 0),
    value,
    wins,
  };
};

/** The merchant's model: a Beta-Binomial posterior per angle. */
export const fitOutcomeModel = (
  outcomes: readonly DesignOutcome[],
  {
    global,
    now = new Date(),
  }: { global?: GlobalPrior | undefined; now?: Date } = {}
): OutcomeModel => {
  const counted = outcomes.filter((item) => countsOf(item, now));
  const wins = counted.filter((item) => profitOf(item) > 0).length;
  const baseRate = baseRateOf(counted.length, wins, global);
  const groups = new Map<
    string,
    { kind: AngleKind; members: DesignOutcome[]; value: string }
  >();
  for (const item of counted) {
    for (const angle of anglesOf(item)) {
      const key = keyOf(angle.kind, angle.value);
      const group = groups.get(key) ?? { ...angle, members: [] };
      group.members.push(item);
      groups.set(key, group);
    }
  }
  return {
    angles: [...groups.values()].map((group) =>
      statsOf(group.kind, group.value, group.members, baseRate)
    ),
    baseRate,
    cost: {
      purchases: outcomes.reduce((sum, item) => sum + item.purchases, 0),
      spendCents: outcomes.reduce((sum, item) => sum + item.spendCents, 0),
    },
    designs: counted.length,
    wins,
  };
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

const pick = ({ drops, kind, profitCents, value }: AngleStats) => ({
  drops,
  kind,
  profitCents,
  value,
});

const whyOf = (angle: AngleStats): OutcomeWhy | undefined => {
  if (angle.pBeat >= CONFIDENT && angle.profitCents > 0) {
    return { ...pick(angle), direction: "up" };
  }
  if (angle.pBeat <= 1 - CONFIDENT && angle.profitCents <= 0) {
    return { ...pick(angle), direction: "down" };
  }
  return undefined;
};

const strength = (angle: AngleStats) => Math.abs(Math.log(angle.lift));

/**
 * How much the merchant's own record favours an idea: the geometric mean of
 * its known angles' lifts, averaged within each kind first so ten entities
 * never outvote one audience, then clamped to [1/MAX_MULTIPLIER,
 * MAX_MULTIPLIER]. 1 with no record or no shared angle. `why` is the
 * strongest confident angle, if any.
 */
export const outcomeScore = (
  idea: OutcomeAttributes,
  model?: OutcomeModel
): OutcomeScore => {
  if (model === undefined || model.designs === 0) {
    return { evidence: [], multiplier: 1 };
  }
  const byKey = new Map(
    model.angles.map((angle) => [keyOf(angle.kind, angle.value), angle])
  );
  const matched = anglesOf(idea).flatMap(({ kind, value }) => {
    const angle = byKey.get(keyOf(kind, value));
    return angle === undefined ? [] : [angle];
  });
  if (matched.length === 0) {
    return { evidence: [], multiplier: 1 };
  }
  const perKind = ANGLE_KINDS.flatMap((kind) => {
    const own = matched.filter((angle) => angle.kind === kind);
    return own.length === 0
      ? []
      : [
          own.reduce((sum, angle) => sum + Math.log(angle.lift), 0) /
            own.length,
        ];
  });
  const logLift =
    perKind.reduce((sum, value) => sum + value, 0) / perKind.length;
  const evidence = matched
    .toSorted((a, b) => strength(b) - strength(a))
    .slice(0, EVIDENCE);
  const why = evidence.map(whyOf).find((item) => item !== undefined);
  return {
    evidence,
    multiplier: clamp(Math.exp(logLift), 1 / MAX_MULTIPLIER, MAX_MULTIPLIER),
    ...(why === undefined ? {} : { why }),
  };
};

/** The merchant's confident angles, winners first, for "What we learned". */
export const angleWhys = (model: OutcomeModel, limit = 5): OutcomeWhy[] =>
  model.angles
    .flatMap((angle) => {
      const why = whyOf(angle);
      return why === undefined ? [] : [{ angle, why }];
    })
    .toSorted(
      (a, b) =>
        Number(b.why.direction === "up") - Number(a.why.direction === "up") ||
        strength(b.angle) - strength(a.angle)
    )
    .slice(0, limit)
    .map(({ why }) => why);

/**
 * Each design's share of a test's spend floor: half split evenly, so every
 * design is still tested, and half by its outcome multiplier, so angles
 * that sold before get more. Shares sum to 1.
 */
export const floorShares = (multipliers: readonly number[]) => {
  const count = multipliers.length;
  if (count === 0) {
    return [];
  }
  const total = multipliers.reduce((sum, value) => sum + Math.max(value, 0), 0);
  return multipliers.map((value) =>
    total <= 0
      ? 1 / count
      : EVEN_SHARE / count + ((1 - EVEN_SHARE) * Math.max(value, 0)) / total
  );
};

/**
 * The merchant's real cost per sale, once their ads have made
 * `minPurchases` purchases: spend over purchases, shrunk to the profit per
 * sale by REAL_CPA_PRIOR_PURCHASES purchases. Undefined before.
 */
export const realCostPerSaleOf = (
  cost: OutcomeModel["cost"],
  profitPerSaleCents: number,
  minPurchases = REAL_CPA_MIN_PURCHASES
) => {
  if (cost.purchases < minPurchases || profitPerSaleCents <= 0) {
    return;
  }
  return Math.round(
    (cost.spendCents + REAL_CPA_PRIOR_PURCHASES * profitPerSaleCents) /
      (cost.purchases + REAL_CPA_PRIOR_PURCHASES)
  );
};
