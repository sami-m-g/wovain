import { log as evlog } from "evlog";

import type { Logger } from "./log";
import { bestMatch } from "./meta-interests";
import type { MetaInterests } from "./meta-interests";
import type { Qloo, QlooDemographics } from "./qloo";
import { QLOO_AUDIENCES } from "./qloo-audiences";
import type { QlooAudience } from "./qloo-audiences";
import type { DecisionTrace, TraceSource } from "./trace";

// Qloo to Meta targeting: who likes the brand's taste references, as a Meta
// ad set's targeting.
//
// - Qloo's demographics (urn:demographics: age buckets and gender
//   affinity) give age_min, age_max and genders.
// - Qloo's audiences (urn:audience:…, ./qloo-audiences) are scored against
//   the brand's Qloo brand entities; the ones that like them more than the
//   rest do are kept.
// - Those audiences and the brand's Qloo entities are matched to real Meta
//   interest IDs through Meta's targeting search (./meta-interests).
//
// Countries stay the hard control. Ages, genders and interests go to Meta as
// Advantage+ audience suggestions, the setting Meta's Ads MCP keeps on: Meta
// may reach past them when that converts better. Every match is kept as
// evidence. A step that fails is logged at error level and marked failed in
// the evidence; a targeting with a failed step or no Qloo audience is never
// staged (qlooAudienceGap): no Qloo audience, no campaign.

export interface QlooEntityInput {
  id: string;
  name: string;
  type: string;
}

// The merchant's own answer (the brand wizard), which wins over Qloo's.
export interface DemographicsOverride {
  ageMax?: number | undefined;
  ageMin?: number | undefined;
  genders?: ("female" | "male" | "all")[] | undefined;
}

export interface TargetingInput {
  // ISO country codes the ads may run in.
  countries: string[];
  entities: readonly QlooEntityInput[];
  override?: DemographicsOverride | undefined;
}

// Meta's ad set targeting spec, the fields wovain sets.
export interface MetaTargeting {
  age_max?: number;
  age_min?: number;
  flexible_spec?: { interests: { id: string; name: string }[] }[];
  // Meta's codes: 1 men, 2 women.
  genders?: number[];
  geo_locations: { countries: string[] };
}

export type Lean = "all" | "female" | "male";
type Source = "merchant" | "qloo";

export interface InterestMatch {
  audienceSize?: number | undefined;
  from: "qloo_audience" | "qloo_entity";
  metaId: string;
  metaName: string;
  path: string[];
  qlooId: string;
  query: string;
}

export interface TargetingEvidence {
  age?:
    | {
        buckets: string[];
        max: number;
        min: number;
        source: Source;
      }
    | undefined;
  audiences: {
    affinity: number;
    id: string;
    lift: number;
    name: string;
  }[];
  // Steps that failed and were left out ("qloo.demographics" …).
  failed: string[];
  gender?:
    | {
        female?: number | undefined;
        lean: Lean;
        male?: number | undefined;
        source: Source;
      }
    | undefined;
  interests: InterestMatch[];
  qlooEntities: QlooEntityInput[];
  // Searched on Meta with no interest named like it.
  unmatched: { from: InterestMatch["from"]; qlooId: string; query: string }[];
}

// What the ad copy writer is told about the audience.
export interface AudiencePersona {
  ages?: string | undefined;
  audiences: string[];
  interests: string[];
  lean?: Lean | undefined;
}

export interface AudienceTargeting {
  evidence: TargetingEvidence;
  persona: AudiencePersona;
  sources: TraceSource[];
  targeting: MetaTargeting;
}

// Why a targeting can't be staged. Every idea is a Qloo tag, so every ad
// reaches Qloo's audience for it: a failed step (retry it) or no Qloo
// audience kept (the brand needs a reference Qloo knows) refuses the
// campaign, never a countries-only ad set.
export type QlooAudienceGap =
  | { reason: "failed"; steps: string[] }
  | { reason: "no_audience" };

export const qlooAudienceGap = (
  evidence: Pick<TargetingEvidence, "audiences" | "failed">
): QlooAudienceGap | undefined => {
  if (evidence.failed.length > 0) {
    return { reason: "failed", steps: [...evidence.failed] };
  }
  if (evidence.audiences.length === 0) {
    return { reason: "no_audience" };
  }
  return undefined;
};

// Qloo's age buckets in Meta's years; Meta's ages stop at 65.
export const QLOO_AGE_BUCKETS = [
  { key: "24_and_younger", max: 24, min: 18 },
  { key: "25_to_29", max: 29, min: 25 },
  { key: "30_to_34", max: 34, min: 30 },
  { key: "35_to_44", max: 44, min: 35 },
  { key: "45_to_54", max: 54, min: 45 },
  { key: "55_and_older", max: 65, min: 55 },
] as const;

// Under Advantage+ audience Meta keeps age_min a hard minimum only up to 25.
export const ADVANTAGE_AGE_MIN_CAP = 25;
// How far one gender's affinity must lead the other's (scores run -1 to 1).
export const GENDER_LEAN = 0.3;
// How far above the average audience one must score to count.
export const AUDIENCE_LIFT = 0.02;
export const MAX_AUDIENCES = 3;
export const MAX_INTERESTS = 10;
const MAX_ENTITIES = 10;
const MAX_BRANDS = 5;
const MAX_ENTITY_QUERIES = 5;
const QLOO_CONCURRENCY = 6;
const META_CONCURRENCY = 4;
const BRAND_TYPE = "urn:entity:brand";
const META_MEN = 1;
const META_WOMEN = 2;

const mean = (values: readonly number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

// One demographic lean for all entities: each bucket's mean affinity.
export const meanDemographics = (
  blocks: readonly QlooDemographics[]
): Pick<QlooDemographics, "age" | "gender"> => {
  const average = (
    pick: (block: QlooDemographics) => Record<string, number>
  ) => {
    const keys = new Set(blocks.flatMap((block) => Object.keys(pick(block))));
    return Object.fromEntries(
      [...keys].map((key) => [
        key,
        mean(blocks.flatMap((block) => pick(block)[key] ?? [])),
      ])
    );
  };
  return {
    age: average((block) => block.age),
    gender: average((block) => block.gender),
  };
};

// The run of age buckets around the one Qloo leans to most, widened while
// the next bucket leans positive too. None when no bucket leans positive.
export const ageRangeOf = (
  age: Record<string, number>
): { buckets: string[]; max: number; min: number } | undefined => {
  const scores = QLOO_AGE_BUCKETS.map((bucket) => age[bucket.key]);
  let peak = -1;
  for (const [index, score] of scores.entries()) {
    const best = peak === -1 ? undefined : scores[peak];
    if (
      score !== undefined &&
      score > 0 &&
      (best === undefined || score > best)
    ) {
      peak = index;
    }
  }
  if (peak === -1) {
    return undefined;
  }
  const leans = (index: number) => (scores[index] ?? 0) > 0;
  let first = peak;
  let last = peak;
  while (first > 0 && leans(first - 1)) {
    first -= 1;
  }
  while (last < QLOO_AGE_BUCKETS.length - 1 && leans(last + 1)) {
    last += 1;
  }
  const run = QLOO_AGE_BUCKETS.slice(first, last + 1);
  return {
    buckets: run.map((bucket) => bucket.key),
    max: run.at(-1)?.max ?? QLOO_AGE_BUCKETS[peak]?.max ?? 0,
    min: run[0]?.min ?? 0,
  };
};

export const leanOf = (gender: Record<string, number>): Lean => {
  const lead = (gender.male ?? 0) - (gender.female ?? 0);
  if (lead >= GENDER_LEAN) {
    return "male";
  }
  if (lead <= -GENDER_LEAN) {
    return "female";
  }
  return "all";
};

const overrideLean = (
  genders: DemographicsOverride["genders"]
): Lean | undefined => {
  if (genders === undefined || genders.length === 0) {
    return undefined;
  }
  const one = new Set(genders.filter((gender) => gender !== "all"));
  if (genders.includes("all") || one.size !== 1) {
    return "all";
  }
  return one.has("male") ? "male" : "female";
};

// The audiences that like the brand more than the average audience does,
// highest first. `scores` holds each audience's mean affinity.
export const pickAudiences = (
  scores: readonly { audience: QlooAudience; affinity: number }[]
) => {
  const average = mean(scores.map((score) => score.affinity));
  return scores
    .map(({ affinity, audience }) => ({
      affinity,
      audience,
      lift: affinity - average,
    }))
    .filter((score) => score.lift >= AUDIENCE_LIFT)
    .toSorted((a, b) => b.lift - a.lift)
    .slice(0, MAX_AUDIENCES);
};

// Meta's targeting spec from the evidence. Countries always; the rest only
// when known.
export const metaTargetingOf = (
  countries: string[],
  evidence: Pick<TargetingEvidence, "age" | "gender" | "interests">
): MetaTargeting => {
  const targeting: MetaTargeting = { geo_locations: { countries } };
  if (evidence.age !== undefined) {
    targeting.age_min = Math.min(evidence.age.min, ADVANTAGE_AGE_MIN_CAP);
    targeting.age_max = evidence.age.max;
  }
  if (evidence.gender?.lean === "male") {
    targeting.genders = [META_MEN];
  }
  if (evidence.gender?.lean === "female") {
    targeting.genders = [META_WOMEN];
  }
  if (evidence.interests.length > 0) {
    targeting.flexible_spec = [
      {
        interests: evidence.interests.map((interest) => ({
          id: interest.metaId,
          name: interest.metaName,
        })),
      },
    ];
  }
  return targeting;
};

export const personaOf = (
  evidence: Pick<
    TargetingEvidence,
    "age" | "audiences" | "gender" | "interests"
  >
): AudiencePersona => ({
  ages:
    evidence.age === undefined
      ? undefined
      : `${evidence.age.min}-${evidence.age.max}`,
  audiences: evidence.audiences.map((audience) => audience.name),
  interests: evidence.interests.map((interest) => interest.metaName),
  lean: evidence.gender?.lean,
});

// Runs `work` over `items`, at most `limit` at a time, in order.
const mapLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> => {
  const results: PromiseSettledResult<R>[] = Array.from({
    length: items.length,
  });
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index] as T;
      try {
        // oxlint-disable-next-line no-await-in-loop
        results[index] = { status: "fulfilled", value: await work(item) };
      } catch (error) {
        results[index] = { reason: error, status: "rejected" };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane)
  );
  return results;
};

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

// A step's failure goes to the error sink (PostHog Error Tracking); the
// other steps still run, so the evidence shows everything that failed.
export const reportFailure = (
  log: Logger | undefined,
  step: string,
  error: unknown
) => {
  const failure = asError(error);
  if (log?.error === undefined) {
    evlog.error({ error: failure.message, step, targeting: "qloo_meta" });
    return;
  }
  log.error(failure, { targeting: { step } });
};

export interface TargetingDeps {
  interests: Pick<MetaInterests, "search">;
  log?: Logger | undefined;
  qloo: Pick<Qloo, "audienceAffinity" | "demographicsOf">;
  // Records each step ("why wovain targeted this").
  trace?: DecisionTrace | undefined;
}

const AGENT = "targeting";

// Runs one step through the trace (or plainly without one).
const step = async <T>(
  deps: TargetingDeps,
  base: { inputSummary: string; step: string },
  run: () => Promise<T>,
  describe: (result: T) => { output: unknown; sources?: TraceSource[] }
): Promise<T> =>
  deps.trace === undefined
    ? await run()
    : await deps.trace.call({ ...base, agent: AGENT }, run, describe);

const demographicsStep = async (
  deps: TargetingDeps,
  input: TargetingInput,
  evidence: TargetingEvidence
) => {
  const override = input.override ?? {};
  const merchantAge =
    override.ageMin !== undefined || override.ageMax !== undefined;
  const merchantLean = overrideLean(override.genders);
  if (merchantAge) {
    const min = override.ageMin ?? QLOO_AGE_BUCKETS[0].min;
    const max = override.ageMax ?? QLOO_AGE_BUCKETS[5].max;
    evidence.age = { buckets: [], max, min, source: "merchant" };
  }
  if (merchantLean !== undefined) {
    evidence.gender = { lean: merchantLean, source: "merchant" };
  }
  const ids = input.entities.slice(0, MAX_ENTITIES).map((entity) => entity.id);
  if ((merchantAge && merchantLean !== undefined) || ids.length === 0) {
    return;
  }
  try {
    const blocks = await step(
      deps,
      {
        inputSummary: `${ids.length} Qloo entities`,
        step: "qloo.demographics",
      },
      async () => await deps.qloo.demographicsOf(ids, deps.log),
      (found) => ({
        output: meanDemographics(found),
        sources: found.map((block) => ({
          id: block.id,
          provider: "qloo" as const,
        })),
      })
    );
    if (blocks.length === 0) {
      return;
    }
    const lean = meanDemographics(blocks);
    const range = ageRangeOf(lean.age);
    if (!merchantAge && range !== undefined) {
      evidence.age = { ...range, source: "qloo" };
    }
    if (merchantLean === undefined) {
      evidence.gender = {
        female: lean.gender.female,
        lean: leanOf(lean.gender),
        male: lean.gender.male,
        source: "qloo",
      };
    }
  } catch (error) {
    evidence.failed.push("qloo.demographics");
    reportFailure(deps.log, "qloo.demographics", error);
  }
};

const audiencesStep = async (
  deps: TargetingDeps,
  input: TargetingInput,
  evidence: TargetingEvidence
) => {
  // Qloo's hackathon API scores audiences against brands only: other
  // entity types answer a flat baseline.
  const brands = input.entities
    .filter((entity) => entity.type === BRAND_TYPE)
    .slice(0, MAX_BRANDS)
    .map((entity) => entity.id);
  if (brands.length === 0) {
    return [];
  }
  try {
    const picked = await step(
      deps,
      {
        inputSummary: `${QLOO_AUDIENCES.length} Qloo audiences × ${brands.length} brands`,
        step: "qloo.audiences",
      },
      async () => {
        const settled = await mapLimit(
          QLOO_AUDIENCES,
          QLOO_CONCURRENCY,
          async (audience) => {
            const affinities = await deps.qloo.audienceAffinity(
              audience.id,
              BRAND_TYPE,
              brands,
              deps.log
            );
            // No Qloo score is no evidence: left out, never counted as 0,
            // so it can't pull the average down and lift the others.
            return affinities.length === 0
              ? undefined
              : { affinity: mean(affinities), audience };
          }
        );
        const scored = settled.flatMap((result) =>
          result.status === "fulfilled" && result.value !== undefined
            ? [result.value]
            : []
        );
        const failures = settled.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : []
        );
        if (scored.length === 0 && failures.length > 0) {
          throw asError(failures[0]);
        }
        for (const failure of failures) {
          reportFailure(deps.log, "qloo.audiences", failure);
        }
        return pickAudiences(scored);
      },
      (kept) => ({
        output: kept.map(({ affinity, audience, lift }) => ({
          affinity,
          id: audience.id,
          lift,
        })),
        sources: kept.map(({ audience }) => ({
          id: audience.id,
          provider: "qloo" as const,
          title: audience.name,
        })),
      })
    );
    evidence.audiences = picked.map(({ affinity, audience, lift }) => ({
      affinity,
      id: audience.id,
      lift,
      name: audience.name,
    }));
    return picked.map(({ audience }) => audience);
  } catch (error) {
    evidence.failed.push("qloo.audiences");
    reportFailure(deps.log, "qloo.audiences", error);
    return [];
  }
};

const interestsStep = async (
  deps: TargetingDeps,
  input: TargetingInput,
  audiences: readonly QlooAudience[],
  evidence: TargetingEvidence
) => {
  const queries = [
    ...audiences.map((audience) => ({
      from: "qloo_audience" as const,
      qlooId: audience.id,
      query: audience.metaQuery,
    })),
    ...input.entities.slice(0, MAX_ENTITY_QUERIES).map((entity) => ({
      from: "qloo_entity" as const,
      qlooId: entity.id,
      query: entity.name,
    })),
  ];
  if (queries.length === 0) {
    return;
  }
  try {
    const settled = await step(
      deps,
      {
        inputSummary: queries.map((query) => query.query).join(", "),
        step: "meta.interests",
      },
      async () => {
        const results = await mapLimit(
          queries,
          META_CONCURRENCY,
          async (query) => ({
            found: await deps.interests.search(query.query, deps.log),
            query,
          })
        );
        if (results.every((result) => result.status === "rejected")) {
          const [first] = results;
          throw asError(
            first?.status === "rejected" ? first.reason : undefined
          );
        }
        return results;
      },
      (results) => ({
        output: results.flatMap((result) =>
          result.status === "fulfilled"
            ? [
                {
                  match: bestMatch(result.value.query.query, result.value.found)
                    ?.id,
                  query: result.value.query.query,
                },
              ]
            : []
        ),
      })
    );
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status === "rejected") {
        reportFailure(deps.log, "meta.interests", result.reason);
        continue;
      }
      const { found, query } = result.value;
      const match = bestMatch(query.query, found);
      if (match === undefined) {
        evidence.unmatched.push(query);
        continue;
      }
      if (seen.has(match.id) || evidence.interests.length >= MAX_INTERESTS) {
        continue;
      }
      seen.add(match.id);
      evidence.interests.push({
        audienceSize: match.audienceSize,
        from: query.from,
        metaId: match.id,
        metaName: match.name,
        path: match.path,
        qlooId: query.qlooId,
        query: query.query,
      });
    }
  } catch (error) {
    evidence.failed.push("meta.interests");
    reportFailure(deps.log, "meta.interests", error);
  }
};

export const buildAudienceTargeting = async (
  deps: TargetingDeps,
  input: TargetingInput
): Promise<AudienceTargeting> => {
  const evidence: TargetingEvidence = {
    audiences: [],
    failed: [],
    interests: [],
    qlooEntities: input.entities
      .slice(0, MAX_ENTITIES)
      .map(({ id, name, type }) => ({
        id,
        name,
        type,
      })),
    unmatched: [],
  };
  const [, audiences] = await Promise.all([
    demographicsStep(deps, input, evidence),
    audiencesStep(deps, input, evidence),
  ]);
  await interestsStep(deps, input, audiences, evidence);
  const targeting = metaTargetingOf(input.countries, evidence);
  const sources: TraceSource[] = [
    ...evidence.qlooEntities.map((entity) => ({
      id: entity.id,
      provider: "qloo" as const,
      title: entity.name,
    })),
    ...evidence.audiences.map((audience) => ({
      id: audience.id,
      provider: "qloo" as const,
      title: audience.name,
    })),
    ...evidence.interests.map((interest) => ({
      id: interest.metaId,
      provider: "meta" as const,
      title: interest.metaName,
    })),
  ];
  deps.trace?.add({
    agent: AGENT,
    inputSummary: `countries ${input.countries.join(",")}`,
    output: { evidence, targeting },
    sources,
    step: "meta.targeting",
  });
  return { evidence, persona: personaOf(evidence), sources, targeting };
};
