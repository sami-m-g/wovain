import { log as evlog } from "evlog";

import { discoveryQlooFailed, momentumOf, seedsOf } from "./brand-discovery";
import { readSaturation } from "./competition";
import type { Saturation } from "./competition";
import { demandOf, marketDemandOf } from "./demand";
import type { AdDemand, Demand } from "./demand";
import { keyOf as wordsKeyOf } from "./evidence";
import type { Citation, TavilyWeb } from "./evidence";
import {
  competitionLevelOf,
  demandField,
  makeOf,
  ok,
  unavailable,
} from "./idea-card";
import type { IdeaCard } from "./idea-card";
import { writeIdeaWords } from "./idea-words";
import type { IdeaWordsResult } from "./idea-words";
import type { Logger } from "./log";
import type { Nemotron } from "./nemotron";
import { outcomeScore } from "./outcomes";
import type { OutcomeModel, OutcomeWhy } from "./outcomes";
import type { InsightsQuery, Qloo, QlooInsight } from "./qloo";
import type { SaturationLevel } from "./saturation";
import { cautionOf, fallbackScore, judgeIdea, sweetSpotOf } from "./sweet-spot";
import type {
  Caution,
  DropReason,
  SweetSpot,
  SweetSpotInput,
  Verdict,
} from "./sweet-spot";
import type { DecisionTrace } from "./trace";
import type { TrendIdea } from "./trends";

// What to sell next, in the new-drop step (openspec drop-directions). The
// step always opens with 3 to 5 directions, ranked by sales potential, with
// the brand-discovery engine's sources; a brand is optional.
//
// - Open ("just sell"): with no brand, or "Ignore my brand this time", each
//   direction grows from one Qloo audience an apparel shop can sell to (a
//   new set each round, so the niches change): what is rising among its
//   fans (bias.trends high) and the genre tag those rising entities share.
// - Brand: with a brand, what is rising among the fans of the brand's Qloo
//   references, and the tags those entities carry, so the directions stay
//   within the brand.
//
// Tavily adds momentum (relevant news in the past month) and saturation
// (near-identical marketplace listings). Code ranks them, Qloo affinity x
// momentum x low saturation (rankOf). The idea_words agent only writes the
// words (a title, the brief and a "why now" line), checked against the
// evidence by the grounding guard (./idea-words), as for every idea a run
// shows; a direction whose words fail is never shown with its raw tag. The
// evidence shown is the Qloo entities, the news and the listings count.
// Without Qloo there are no directions: a Qloo failure throws, it never
// falls back to directions made without it.

export const MAX_DIRECTIONS = 5;
// Themes checked for demand: more than are shown, since a theme nobody
// advertises or buys is dropped, never shown to fill the list.
export const CANDIDATES = 8;
// A run's seed is at most this long.
export const BRIEF_MAX = 200;
// Rising entities whose tags are read (brand mode): each is one Qloo call.
const RISING_TAGGED = 6;
const TAGS_PER_ENTITY = 4;
// Rising entities per audience whose tags are read together (open mode).
const AUDIENCE_TAGGED = 4;
const EVIDENCE_REFS = 3;
const GAPS_MAX = 5;
const NEWS_PER_DIRECTION = 3;

export interface DirectionBrand {
  // Qloo's age buckets with their affinity, e.g. { "25_to_29": 0.4 }.
  ageAffinity?: Record<string, number> | undefined;
  // The brand's Qloo entities (its taste references, resolved).
  entities: readonly { id: string; name: string }[];
  genders?: readonly ("all" | "female" | "male")[] | undefined;
  niches: readonly string[];
  voice?: string | null | undefined;
}

export interface DirectionRequest {
  // The saved brand; undefined to suggest across audiences ("just sell").
  brand?: DirectionBrand | undefined;
  // "Show me others": a new set of audiences in open mode.
  round: number;
  // Varies the audiences between merchants (the user ID).
  salt: string;
}

export interface DirectionDeps {
  ask: Nemotron;
  locale: string;
  log?: Logger | undefined;
  // The Meta Ad Library, when the merchant's Meta account is connected:
  // the shops advertising apparel on a theme and for how long.
  adLibrary?: ((theme: string) => Promise<AdDemand>) | undefined;
  // idea-evidence-gate: show only directions with Qloo evidence, proof of
  // demand and a competition read, ranked by the sweet spot's lower bound.
  gate?: boolean | undefined;
  // Progress as it happens, so the page can show each card the moment it
  // is ready instead of waiting for all of them.
  onEvent?: ((event: DirectionEvent) => void) | undefined;
  // feedback-loop on: the merchant's track record, whose multiplier scales
  // each direction's rank (./outcomes).
  outcomes?: OutcomeModel | undefined;
  qloo: Pick<Qloo, "insights" | "tagsFor">;
  tavily: Pick<TavilyWeb, "search">;
  trace?: DecisionTrace | undefined;
}

// What the page is told while directions are being found: the step under
// way (Qloo, then the news and listings checks, then the words), and each
// direction as soon as it is written.
export type DirectionStep = "listings" | "qloo" | "words";

export type DirectionEvent =
  | { kind: "step"; step: DirectionStep }
  | { direction: DropDirection; kind: "direction" }
  // A card shown with its facts whose words then failed the check: the
  // page takes it away (idea-evidence-gate).
  | { key: string; kind: "withdrawn" };

export interface DirectionEvidence {
  // Whether the Ad Library could be read (the merchant's Meta connection).
  adLibrary?: "connected" | "not_connected" | undefined;
  // The Qloo audience the direction grew from (open mode).
  audience?: string | undefined;
  // Qloo tags the rising entities carry that no listing read covers.
  gaps?: string[] | undefined;
  // Proof that it sells: long-running ads, bestsellers and reviews.
  demand?: Demand | undefined;
  // Relevant news in the past month; undefined when Tavily failed.
  momentum?: { hits: number; sources: Citation[] } | undefined;
  // Qloo's mean affinity of the rising entities, 0 to 1.
  qlooAffinity: number;
  // Rising Qloo entities that carry the theme.
  rising: { id: string; name: string }[];
  // Near-identical marketplace listings; undefined when Tavily failed.
  saturation?:
    | { count: number; level: SaturationLevel; sampled?: number | undefined }
    | undefined;
}

export interface DropDirection {
  // What the run researches: the brief the card fills in.
  brief: string;
  // The one idea contract (./idea-card), the same for every pipeline.
  card?: IdeaCard | undefined;
  // Why the merchant's record favours or warns against it (feedback-loop).
  outcome?: OutcomeWhy | undefined;
  // The honest rank's numbers, when the evidence gate ranked it.
  spot?: SweetSpot | undefined;
  // Shown although it didn't pass the evidence gate, because none did: why
  // it didn't. The card says so.
  caution?: Caution | undefined;
  // Who wears it: "for night owls who read in cafés".
  buyer?: string | undefined;
  // Why they buy it: identity, a gift, an event.
  occasion?: string | undefined;
  evidence: DirectionEvidence;
  key: string;
  score: number;
  // The other Qloo tags its rising entities carry, by name.
  cues?: string[] | undefined;
  // The ID of the Qloo tag the direction grew from; directions kept before
  // it was saved have none.
  qlooTag?: string | undefined;
  // The Qloo genre tag the direction grew from, by name.
  theme: string;
  title: string;
  whyNow: string;
}

export type DirectionScope = "brand" | "open";

export interface Directions {
  // What the evidence gate checked and why each theme wasn't shown as
  // proven, so an empty or cautious list says why (gate on).
  checked?: { reason: DropReason; theme: string }[] | undefined;
  // Themes left out for lack of proof that they sell, or by the gate.
  dropped?: number | undefined;
  directions: DropDirection[];
  // No theme passed the gate: the directions shown carry their caution.
  unconfirmed?: boolean | undefined;
  scope: DirectionScope;
  // Tavily failed for at least one direction: momentum or saturation unknown.
  tavilyFailed: boolean;
  // The connected Ad Library read failed for at least one direction.
  adLibraryFailed?: boolean | undefined;
}

// What the new-drop step gets and what is kept for it: the directions and
// whether the merchant has a brand (for "Ignore my brand this time").
export interface DirectionsAnswer extends Directions {
  hasBrand: boolean;
}

const failure = (step: string, error: unknown) => {
  evlog.error({
    directions: { step },
    error: {
      code: "DROP_DIRECTIONS_STEP_FAILED",
      message: `Drop directions ${step} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      name: "DropDirectionsStepFailed",
      ...(error instanceof Error &&
        error.stack !== undefined && { stack: error.stack }),
    },
  });
};

const mean = (values: readonly number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const keyOf = (text: string) =>
  text.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");

// The brand's strongest Qloo age bucket, and its gender when only one.
export const signalsOf = (brand: DirectionBrand) => {
  const [age] = Object.entries(brand.ageAffinity ?? {}).toSorted(
    (first, second) => second[1] - first[1]
  );
  const genders = (brand.genders ?? []).filter((one) => one !== "all");
  const [gender] = genders;
  return {
    age: age?.[0],
    entities: brand.entities.map((entity) => entity.id),
    gender: genders.length === 1 ? gender : undefined,
  };
};

// What is rising for the signals, best first, artists and TV shows mixed.
// No brands: Qloo's brands for these signals came back as charities and
// medical associations (tried live on 2026-10-29), as in brand discovery.
// Undefined when both calls failed (logged).
const risingFor = async (
  deps: DirectionDeps,
  signals: Omit<InsightsQuery, "take" | "type">,
  exclude: ReadonlySet<string>
): Promise<QlooInsight[] | undefined> => {
  const settled = await Promise.allSettled([
    deps.qloo.insights({ ...signals, take: 8, type: "artist" }, deps.log),
    deps.qloo.insights({ ...signals, take: 8, type: "tv_show" }, deps.log),
  ]);
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      failure("qloo.insights", outcome.reason);
    }
  }
  if (settled.every((outcome) => outcome.status === "rejected")) {
    return undefined;
  }
  const seen = new Set<string>();
  return settled
    .flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value : []))
    .filter((one) => {
      const fresh = !exclude.has(one.id) && !seen.has(one.id);
      seen.add(one.id);
      return fresh;
    })
    .toSorted((first, second) => second.affinity - first.affinity);
};

interface Candidate {
  audience?: string | undefined;
  carriers: QlooInsight[];
  // The other Qloo tags its rising entities carry: audience cues.
  cues: string[];
  // The theme's Qloo tag ID ("urn:tag:genre:media:dark_academia").
  id: string;
  name: string;
  weight: number;
}

// Brand mode: the genre tags the entities rising among the brand's fans
// carry, each with the entities that carry it, heaviest first. A tag that
// only restates the brand's niche is no new direction.
const brandCandidates = async (
  deps: DirectionDeps,
  brand: DirectionBrand
): Promise<Candidate[]> => {
  const rising = await risingFor(
    deps,
    { ...signalsOf(brand), trends: "high" },
    new Set(brand.entities.map((entity) => entity.id))
  );
  if (rising === undefined) {
    throw discoveryQlooFailed();
  }
  const tagged = rising.slice(0, RISING_TAGGED);
  const settled = await Promise.allSettled(
    tagged.map(
      async (entity) =>
        await deps.qloo.tagsFor([entity.id], deps.log, TAGS_PER_ENTITY)
    )
  );
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      failure("qloo.tags", outcome.reason);
    }
  }
  if (
    settled.length > 0 &&
    settled.every((outcome) => outcome.status === "rejected")
  ) {
    throw discoveryQlooFailed();
  }
  const niches = new Set(brand.niches.map(keyOf));
  const themes = new Map<string, Candidate>();
  for (const [index, outcome] of settled.entries()) {
    const entity = tagged[index];
    if (outcome.status === "rejected" || entity === undefined) {
      continue;
    }
    for (const tag of outcome.value) {
      const key = keyOf(tag.name);
      if (key === "" || niches.has(key)) {
        continue;
      }
      const theme = themes.get(key) ?? {
        carriers: [],
        cues: [],
        id: tag.id,
        name: tag.name,
        weight: 0,
      };
      theme.carriers.push(entity);
      for (const other of outcome.value) {
        if (other.name !== tag.name && !theme.cues.includes(other.name)) {
          theme.cues.push(other.name);
        }
      }
      theme.weight += entity.affinity * Math.max(tag.affinity, 0.1);
      themes.set(key, theme);
    }
  }
  return [...themes.values()]
    .toSorted((first, second) => second.weight - first.weight)
    .slice(0, CANDIDATES);
};

// Open mode: one direction per Qloo audience, its theme the strongest tag
// its rising entities share that no other direction took.
const openCandidates = async (
  deps: DirectionDeps,
  round: number,
  salt: string
): Promise<Candidate[]> => {
  const audiences = seedsOf({ mode: "auto", round }, salt)
    .flatMap((seed) => (seed.audience === undefined ? [] : [seed.audience]))
    .slice(0, CANDIDATES);
  const settled = await Promise.allSettled(
    audiences.map(async (audience) => {
      const rising = await risingFor(
        deps,
        { audiences: [audience.id], trends: "high" },
        new Set()
      );
      if (rising === undefined) {
        throw new Error(`Qloo found nothing for ${audience.name}`);
      }
      const carriers = rising.slice(0, AUDIENCE_TAGGED);
      const tags = await deps.qloo.tagsFor(
        carriers.map((one) => one.id),
        deps.log,
        TAGS_PER_ENTITY
      );
      return { audience, carriers, tags };
    })
  );
  const used = new Set<string>();
  const candidates: Candidate[] = [];
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      failure("qloo.audience", outcome.reason);
      continue;
    }
    const { audience, carriers, tags } = outcome.value;
    const tag = tags.find((one) => {
      const key = keyOf(one.name);
      return key !== "" && !used.has(key);
    });
    if (tag === undefined || carriers.length === 0) {
      continue;
    }
    used.add(keyOf(tag.name));
    candidates.push({
      audience: audience.name,
      carriers,
      cues: tags.filter((one) => one !== tag).map((one) => one.name),
      id: tag.id,
      name: tag.name,
      weight: tag.affinity,
    });
  }
  if (
    settled.length > 0 &&
    settled.every((outcome) => outcome.status === "rejected")
  ) {
    throw discoveryQlooFailed();
  }
  return candidates;
};

// One proof source; a failure is logged and leaves that source unknown.
const proofFrom = async <T>(
  step: string,
  read: (() => Promise<T>) | undefined
): Promise<T | undefined> => {
  if (read === undefined) {
    return;
  }
  try {
    return await read();
  } catch (error) {
    failure(step, error);
  }
};

// What a theme's rank weighs saturation as: open markets count fully.
const OPENNESS: Record<SaturationLevel, number> = {
  high: 0.35,
  low: 1,
  medium: 0.7,
};
const UNKNOWN_OPENNESS = 0.6;

// Proof of demand x Qloo audience fit x how open the market is.
export const rankOf = (
  demand: Demand,
  qlooAffinity: number,
  saturation: SaturationLevel | undefined
) =>
  demand.score *
  qlooAffinity *
  (saturation === undefined ? UNKNOWN_OPENNESS : OPENNESS[saturation]);

// What a theme's checks read with: Tavily, and the Ad Library when connected.
type CheckDeps = Pick<DirectionDeps, "adLibrary" | "log" | "tavily">;

// Recent news for the theme; undefined when Tavily failed (logged).
const momentumFor = async (deps: CheckDeps, query: string) => {
  try {
    return await momentumOf(deps, query);
  } catch (error) {
    failure("tavily.momentum", error);
  }
};

// Near-identical listings for the theme; undefined when Tavily failed.
const saturationFor = async (
  deps: CheckDeps,
  query: string
): Promise<Saturation | undefined> => {
  try {
    return await readSaturation(deps.tavily, query, deps.log);
  } catch (error) {
    failure("tavily.saturation", error);
  }
};

interface Draft {
  caution?: Caution | undefined;
  cues?: string[] | undefined;
  qlooTag?: string | undefined;
  evidence: DirectionEvidence;
  key: string;
  outcome?: OutcomeWhy | undefined;
  score: number;
  theme: string;
}

// A theme's checks, all at once: the news, the listings count and both
// proofs of demand.
const checksOf = async (deps: CheckDeps, theme: string, query: string) => {
  const [momentum, saturation, ads, market] = await Promise.all([
    momentumFor(deps, query),
    saturationFor(deps, query),
    proofFrom(
      "meta.ad_library",
      deps.adLibrary === undefined
        ? undefined
        : async () => await deps.adLibrary?.(theme)
    ),
    proofFrom(
      "tavily.marketplaces",
      async () => await marketDemandOf(deps.tavily, theme)
    ),
  ]);
  return { ads, market, momentum, saturation };
};

type Checks = Awaited<ReturnType<typeof checksOf>>;

// Which reads failed: Tavily's (news, listings, marketplaces), or the Ad
// Library when it is connected.
const failedReads = (deps: DirectionDeps, checks: Checks) => ({
  adLibrary: deps.adLibrary !== undefined && checks.ads === undefined,
  tavily:
    checks.momentum === undefined ||
    checks.saturation === undefined ||
    checks.market === undefined,
});

// A proven theme's card before its words.
// The candidate's audience cues that no listing read for it carries.
export const gapsAmong = (
  cues: readonly string[],
  listings: readonly Citation[]
) => {
  const text = ` ${listings.map((one) => wordsKeyOf(one.title)).join(" ")} `;
  return [
    ...new Set(
      cues.filter((cue) => {
        const key = wordsKeyOf(cue);
        return key !== "" && !text.includes(` ${key} `);
      })
    ),
  ].slice(0, GAPS_MAX);
};

const draftOf = (
  candidate: Candidate,
  index: number,
  demand: Demand,
  momentum: Checks["momentum"],
  saturation: Checks["saturation"],
  adLibrary: DirectionEvidence["adLibrary"]
): Draft => {
  const carriers = candidate.carriers.slice(0, EVIDENCE_REFS);
  const qlooAffinity = mean(carriers.map((one) => one.affinity));
  return {
    cues: candidate.cues,
    evidence: {
      adLibrary,
      audience: candidate.audience,
      demand,
      gaps:
        saturation === undefined
          ? undefined
          : gapsAmong(candidate.cues, saturation.listings),
      momentum:
        momentum === undefined
          ? undefined
          : {
              hits: momentum.hits,
              sources: momentum.sources.slice(0, NEWS_PER_DIRECTION),
            },
      qlooAffinity,
      rising: carriers.map((one) => ({ id: one.id, name: one.name })),
      saturation:
        saturation === undefined
          ? undefined
          : {
              count: saturation.count,
              level: saturation.level,
              sampled: saturation.sampled,
            },
    },
    key: `d${index}`,
    qlooTag: candidate.id,
    score: rankOf(demand, qlooAffinity, saturation?.level),
    theme: candidate.name,
  };
};

// What the sweet spot reads off a direction's evidence.
export const sweetInputOf = (evidence: DirectionEvidence): SweetSpotInput => ({
  ads: evidence.demand?.ads,
  gaps: evidence.gaps?.length ?? 0,
  listings: evidence.saturation?.count,
  market: evidence.demand?.market,
  qlooAffinity: evidence.rising.length === 0 ? 0 : evidence.qlooAffinity,
});

// The merchant's record scales a direction's rank (1 with none): their own
// angles for this theme, its Qloo tag being the theme.
const outcomeOf = (deps: DirectionDeps, theme: string) => {
  const { multiplier, why } = outcomeScore(
    { qlooTags: [theme], theme },
    deps.outcomes
  );
  return { multiplier, outcome: why };
};

// A direction as the one idea card (./idea-card).
export const directionCardOf = (
  draft: Draft & { spot?: SweetSpot | undefined },
  // Absent while the words are being written.
  words?: IdeaWordsResult
): IdeaCard => {
  const { evidence } = draft;
  const { demand } = evidence;
  const listings = evidence.demand?.market?.listings ?? [];
  return {
    audience: unavailable("not_read"),
    competition:
      evidence.saturation === undefined
        ? unavailable("read_failed")
        : ok({
            advertisers: demand?.ads?.advertisers,
            citations: [],
            gaps: evidence.gaps ?? [],
            level: competitionLevelOf(
              evidence.saturation.count,
              demand?.ads?.advertisers ?? 0,
              false
            ),
            listings: evidence.saturation.count,
            sampled: evidence.saturation.sampled,
          }),
    make: makeOf(words),
    origin: "directions",
    outcome: draft.outcome,
    spot: draft.spot,
    why:
      evidence.qlooAffinity > 0 && evidence.rising.length > 0
        ? ok({
            affinity: evidence.qlooAffinity,
            citations: [...(evidence.momentum?.sources ?? []), ...listings],
            demand:
              demand === undefined
                ? unavailable("read_failed")
                : demandField(
                    demand.ads,
                    demand.market,
                    evidence.adLibrary ?? "not_connected",
                    demand.proven
                  ),
            qloo: {
              affinity: evidence.qlooAffinity,
              audience: evidence.audience,
              entities: evidence.rising,
            },
            qlooTag: { id: draft.qlooTag, name: draft.theme },
            sentence: words?.status === "ok" ? words.whyNow : "",
            trend:
              evidence.momentum === undefined
                ? undefined
                : { news: evidence.momentum.hits },
          })
        : unavailable("none_found"),
  };
};

// A direction's words, checked against its evidence (./idea-words): shown
// once named. A direction whose words fail the check twice is dropped (the
// caller records it), so no card shows a raw tag or an invented fact.
const namedDirection = async (
  deps: DirectionDeps,
  draft: Draft & { spot?: SweetSpot | undefined }
): Promise<DropDirection | undefined> => {
  const { evidence } = draft;
  const words = await writeIdeaWords(
    { ask: deps.ask, locale: deps.locale, log: deps.log, trace: deps.trace },
    {
      demand: {
        bestsellers: evidence.demand?.market?.bestsellers,
        longRunningAds: evidence.demand?.ads?.validated,
        reviews: evidence.demand?.market?.reviews,
      },
      gaps: evidence.gaps,
      nearIdenticalListings: evidence.saturation?.count,
      newsThisMonth: evidence.momentum?.hits,
      qloo: {
        affinity: Number(evidence.qlooAffinity.toFixed(2)),
        entities: evidence.rising.map((one) => one.name),
        tag: draft.theme,
      },
      why: evidence.audience,
    }
  );
  if (words.status !== "ok") {
    return;
  }
  const direction: DropDirection = {
    ...draft,
    brief: words.concept,
    buyer: words.buyer,
    card: directionCardOf(draft, words),
    occasion: words.occasion,
    title: words.title,
    whyNow: words.whyNow,
  };
  deps.onEvent?.({ direction, kind: "direction" });
  return direction;
};

// When no theme passes the gate: the best ones Qloo backs, each shown with
// its caution (unproven, unread or crowded) and ranked below any proven
// one would be. A theme whose words fail the check is still left out.
const cautiousDirections = async (
  deps: DirectionDeps,
  cautious: readonly {
    caution: Caution;
    draft: Draft;
    spot: SweetSpot;
    weight: number;
  }[]
): Promise<DropDirection[]> => {
  // Validate in weight order, a batch at a time, until enough pass: the
  // top few failing their words must not hide a lower one that passes.
  // The merchant's record scales the weight before any is dropped.
  const ranked = cautious
    .map((one) => {
      const { multiplier, outcome } = outcomeOf(deps, one.draft.theme);
      return { ...one, outcome, score: one.weight * multiplier };
    })
    .toSorted((first, second) => second.score - first.score);
  if (ranked.length > 0) {
    deps.onEvent?.({ kind: "step", step: "words" });
  }
  const named: DropDirection[] = [];
  for (
    let start = 0;
    start < ranked.length && named.length < MAX_DIRECTIONS;
    start += MAX_DIRECTIONS
  ) {
    // One batch at a time: later drafts are only worded when needed.
    // oxlint-disable-next-line no-await-in-loop
    const batch = await Promise.all(
      ranked.slice(start, start + MAX_DIRECTIONS).map(
        async ({ caution, draft, outcome, score, spot }) =>
          // A theme whose words fail keeps its gate reason in the trace.
          await namedDirection(deps, {
            ...draft,
            caution,
            outcome,
            score,
            spot,
          })
      )
    );
    named.push(
      ...batch.filter((one): one is DropDirection => one !== undefined)
    );
  }
  const sorted = named.toSorted((first, second) => second.score - first.score);
  // A card already announced but cut by the limit leaves the list too.
  for (const cut of sorted.slice(MAX_DIRECTIONS)) {
    deps.onEvent?.({ key: cut.key, kind: "withdrawn" });
  }
  return sorted.slice(0, MAX_DIRECTIONS);
};

// Up to MAX_DIRECTIONS directions for the next drop, best first: within the
// brand when one is given, else across Qloo audiences. Fewer when Qloo
// finds little; never one Qloo didn't find.
export const suggestDirections = async (
  deps: DirectionDeps,
  { brand: given, round, salt }: DirectionRequest
): Promise<Directions> => {
  const brand =
    given !== undefined && given.entities.length > 0 ? given : undefined;
  const scope: DirectionScope = brand === undefined ? "open" : "brand";
  deps.onEvent?.({ kind: "step", step: "qloo" });
  const candidates =
    brand === undefined
      ? await openCandidates(deps, round, salt)
      : await brandCandidates(deps, brand);
  deps.trace?.add({
    agent: "drop_directions",
    inputSummary:
      brand === undefined
        ? `open; round ${round}`
        : `brand; ${brand.entities.length} reference(s)`,
    output: {
      scope,
      themes: candidates.map((one) => ({
        audience: one.audience,
        theme: one.name,
      })),
    },
    sources: candidates.flatMap((one) =>
      one.carriers.slice(0, 2).map((entity) => ({
        id: entity.id,
        provider: "qloo" as const,
        title: entity.name,
      }))
    ),
    step: "directions.qloo",
  });
  let tavilyFailed = false;
  let adLibraryFailed = false;
  const noteFailures = (failed: ReturnType<typeof failedReads>) => {
    tavilyFailed ||= failed.tavily;
    adLibraryFailed ||= failed.adLibrary;
  };
  const niche = brand?.niches[0] ?? "";
  if (candidates.length > 0) {
    deps.onEvent?.({ kind: "step", step: "listings" });
  }
  let writing = false;
  const announceWords = () => {
    if (!writing) {
      writing = true;
      deps.onEvent?.({ kind: "step", step: "words" });
    }
  };
  const proofs: { demand: Demand; theme: string }[] = [];
  const gateDrops: {
    reason: DropReason;
    spot?: SweetSpot | undefined;
    theme: string;
  }[] = [];
  // Themes the gate didn't pass but Qloo backs: shown with their caution
  // when no theme passes, so the step never comes back empty-handed.
  const cautious: {
    caution: Caution;
    draft: Draft;
    spot: SweetSpot;
    weight: number;
  }[] = [];
  const noteDrop = (
    draft: Draft,
    input: SweetSpotInput,
    verdict: Extract<Verdict, { kept: false }>
  ) => {
    gateDrops.push({
      reason: verdict.reason,
      spot: verdict.spot,
      theme: draft.theme,
    });
    const caution = cautionOf(verdict.reason);
    if (caution !== undefined) {
      cautious.push({
        caution,
        draft,
        spot: verdict.spot ?? sweetSpotOf(input),
        weight: fallbackScore(input),
      });
    }
  };
  // Each candidate goes through its own checks and words in parallel, and
  // is announced as soon as it is written.
  const settled = await Promise.all(
    candidates.map(async (candidate, index): Promise<DropDirection[]> => {
      const query =
        niche === "" ? candidate.name : `${candidate.name} ${niche}`;
      const { ads, market, momentum, saturation } = await checksOf(
        deps,
        candidate.name,
        query
      );
      noteFailures(failedReads(deps, { ads, market, momentum, saturation }));
      const demand = demandOf(ads, market);
      proofs.push({ demand, theme: candidate.name });
      const adLibrary =
        deps.adLibrary === undefined ? "not_connected" : "connected";
      if (deps.gate === true) {
        const draft = draftOf(
          candidate,
          index,
          demand,
          momentum,
          saturation,
          adLibrary
        );
        const input = sweetInputOf(draft.evidence);
        const verdict = judgeIdea(input);
        if (!verdict.kept) {
          noteDrop(draft, input, verdict);
          return [];
        }
        announceWords();
        const { multiplier, outcome } = outcomeOf(deps, candidate.name);
        const named = await namedDirection(deps, {
          ...draft,
          outcome,
          score: verdict.spot.score * multiplier,
          spot: verdict.spot,
        });
        if (named === undefined) {
          gateDrops.push({
            reason: "no_title",
            spot: verdict.spot,
            theme: candidate.name,
          });
          return [];
        }
        return [named];
      }
      // No shop advertises it for weeks and nothing about it sells: not
      // suggested.
      if (!demand.proven) {
        return [];
      }
      const unweighed = draftOf(
        candidate,
        index,
        demand,
        momentum,
        saturation,
        adLibrary
      );
      const { multiplier, outcome } = outcomeOf(deps, candidate.name);
      const draft = {
        ...unweighed,
        outcome,
        score: unweighed.score * multiplier,
      };
      announceWords();
      const named = await namedDirection(deps, draft);
      return named === undefined ? [] : [named];
    })
  );
  const proven = settled
    .flat()
    .toSorted((first, second) => second.score - first.score)
    .slice(0, MAX_DIRECTIONS);
  // No theme passed the gate: the ones Qloo backs are shown with their
  // caution instead of an empty step.
  const unconfirmed =
    deps.gate === true && proven.length === 0 && cautious.length > 0;
  const ranked = unconfirmed
    ? await cautiousDirections(deps, cautious)
    : proven;
  const shownThemes = new Set(ranked.map((one) => one.theme));
  const dropped =
    deps.gate === true
      ? gateDrops.filter((one) => !shownThemes.has(one.theme)).length
      : proofs.filter((one) => !one.demand.proven).length;
  deps.trace?.add({
    agent: "drop_directions",
    inputSummary: `${ranked.length} direction(s)`,
    output: {
      // The evidence gate's drops, each with its reason (gate on).
      gate: deps.gate === true ? gateDrops : undefined,
      // Every theme's proof, kept or dropped.
      proofs: proofs.map(({ demand, theme }) => ({
        advertisers: demand.ads?.advertisers,
        bestsellers: demand.market?.bestsellers,
        evergreen: demand.ads?.evergreen,
        proven: demand.proven,
        reviews: demand.market?.reviews,
        score: Number(demand.score.toFixed(3)),
        theme,
        validated: demand.ads?.validated,
      })),
      ranked: ranked.map((draft) => ({
        caution: draft.caution,
        momentum: draft.evidence.momentum?.hits,
        qloo: Number(draft.evidence.qlooAffinity.toFixed(3)),
        saturation: draft.evidence.saturation?.level,
        score: Number(draft.score.toFixed(3)),
        theme: draft.theme,
      })),
      // Nothing passed: the directions shown carry their caution.
      unconfirmed,
    },
    sources: [
      {
        provider: "rule",
        title: "proof of demand x Qloo audience fit x low saturation",
      },
      ...ranked.flatMap((draft) => [
        ...(draft.evidence.demand?.ads?.samples ?? []).map((sample) => ({
          provider: "meta" as const,
          title: sample.page,
          url: sample.url,
        })),
        ...(draft.evidence.demand?.market?.listings ?? []).map((listing) => ({
          provider: "tavily" as const,
          title: listing.title,
          url: listing.url,
        })),
      ]),
    ],
    step: "directions.rank",
  });
  return {
    adLibraryFailed,
    checked:
      deps.gate === true
        ? gateDrops.map(({ reason, theme }) => ({ reason, theme }))
        : undefined,
    directions: ranked,
    dropped,
    scope,
    tavilyFailed,
    ...(unconfirmed && { unconfirmed: true }),
  };
};

// A picked direction's words, as the run's naming step keeps them: they
// were checked against the evidence when the direction was written.
const pickedWords = (direction: DropDirection): IdeaWordsResult | undefined => {
  const make = direction.card?.make;
  if (make?.status !== "ok") {
    return undefined;
  }
  return {
    buyer: make.value.buyer ?? direction.buyer ?? "",
    concept: make.value.concept,
    occasion: make.value.occasion ?? direction.occasion ?? "",
    status: "ok",
    style: make.value.style ?? "",
    title: make.value.title,
    whyNow: direction.whyNow,
  };
};

// A kept direction picked to start a drop, its checks read again (the
// news, the listings, the marketplaces' proof). Its Qloo evidence and its
// checked words stay; a read that fails keeps what was kept.
export const recheckDirection = async (
  deps: CheckDeps,
  direction: DropDirection,
  query = direction.theme
): Promise<DropDirection> => {
  const kept = direction.evidence;
  const { ads, market, momentum, saturation } = await checksOf(
    deps,
    direction.theme,
    query
  );
  const demand = demandOf(
    ads ?? kept.demand?.ads,
    market ?? kept.demand?.market
  );
  const evidence: DirectionEvidence = {
    ...kept,
    demand,
    gaps:
      saturation === undefined
        ? kept.gaps
        : gapsAmong(kept.gaps ?? [], saturation.listings),
    momentum:
      momentum === undefined
        ? kept.momentum
        : {
            hits: momentum.hits,
            sources: momentum.sources.slice(0, NEWS_PER_DIRECTION),
          },
    saturation:
      saturation === undefined
        ? kept.saturation
        : {
            count: saturation.count,
            level: saturation.level,
            sampled: saturation.sampled,
          },
  };
  const rechecked = {
    ...direction,
    evidence,
    score: rankOf(demand, kept.qlooAffinity, evidence.saturation?.level),
  };
  return {
    ...rechecked,
    card: directionCardOf(rechecked, pickedWords(direction)),
  };
};

const NEUTRAL_SIGNAL = 0.5;

// A picked direction as the run's one idea (./trends TrendIdea): its
// evidence, its checked words and its rank, so the run draws it without
// researching the brief again.
export const trendIdeaOf = (direction: DropDirection): TrendIdea => {
  const { evidence } = direction;
  const { demand, saturation } = evidence;
  return {
    caution: direction.caution,
    cues: direction.cues,
    moment: direction.whyNow === "" ? undefined : direction.whyNow,
    outcome: direction.outcome,
    proof: {
      gaps: evidence.gaps ?? [],
      market: demand?.market,
      proven: demand?.proven ?? false,
      supply:
        saturation === undefined
          ? null
          : {
              citations: demand?.market?.listings ?? [],
              count: saturation.count,
              level: saturation.level,
              sampled: saturation.sampled ?? 0,
            },
    },
    qlooTag: direction.qlooTag,
    rank: 1,
    references: [],
    score: direction.score,
    // What directions don't read (prices, recency, relevance) is neutral.
    signals: {
      affinity: evidence.qlooAffinity,
      ipSafety: 1,
      margin: NEUTRAL_SIGNAL,
      marketHits: saturation?.count ?? 0,
      newsHits: evidence.momentum?.hits ?? 0,
      recency: NEUTRAL_SIGNAL,
      relevance: NEUTRAL_SIGNAL,
    },
    sources: evidence.momentum?.sources ?? [],
    spot: direction.spot,
    taste: {
      affinities: [],
      seeds: evidence.rising.map(({ id, name }) => ({ id, name, type: "" })),
    },
    theme: direction.theme,
    words: pickedWords(direction),
  };
};
