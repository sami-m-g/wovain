import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";
import { keywordsOf } from "./themes";

// Qloo's Taste API on the hackathon server. Qloo ships no client SDK, so this
// is plain fetch with the X-Api-Key header. Only the seed and Qloo IDs go to
// Qloo, and its answers are untrusted: every field past the IDs is optional,
// so a different shape means fewer signals rather than an error.
//
// The cross-domain taste map reads `feature.explainability` the way TasteCast
// does (MIT, Copyright (c) 2025 swanky: https://github.com/swanky/tastecast,
// src/agent/match.ts): each recommended entity says how much each seed entity
// contributed to it.

export interface QlooConfig {
  apiKey: string | undefined;
  baseURL: string;
}

// The hackathon server took 5 to 19 s on some insights calls (tried live on
// 2026-10-30), so a call waits 30 s. A timed-out call is retried once, not
// RETRIES times, so a merchant waits at most about a minute for it.
const TIMEOUT_MS = 30_000;
const TIMEOUT_RETRIES = 1;
// How long a Qloo answer is reused, and how many are kept per client.
const ANSWER_TTL_MS = 30 * 60_000;
const ANSWERS_KEPT = 500;
// Ranked localities (placesOf) are slow on the hackathon server.
const PLACES_TIMEOUT_MS = 60_000;
const QLOO_CONCURRENCY = 4;
const RETRIES = 2;
// A 429 is retried longer, with jitter, so a burst (several merchants on Home
// at once) spreads out instead of failing together.
const RATE_LIMIT_RETRIES = 5;
const RETRY_MS = 500;
const TOO_MANY = 429;
const SERVER_ERROR = 500;

// Entities a merchant's seed can name that fans have tastes about. Without
// the filter, a word like "hiking" matches restaurants and trails (places),
// whose tags ("Identifies as women-owned") are no theme for a shirt.
const SEED_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:movie",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:videogame",
].join(",");

// Tag families that read as a theme: genres and keywords of media and music.
const THEME_TAG_TYPES = [
  "urn:tag:genre:media",
  "urn:tag:genre:music",
  "urn:tag:keyword:media",
].join(",");
const THEME_MAX = 120;

// Domains the seed's fans also like, for the cross-domain taste map. The
// hackathon server refuses artist insights from artist signals, and trend
// bias for books and games (tried live on 2026-10-28), so brands, films and
// TV carry it.
export const AFFINITY_TYPES = ["brand", "movie", "tv_show"] as const;
export type AffinityType = (typeof AFFINITY_TYPES)[number];
const AFFINITIES_PER_TYPE = "3";
const CUES_PER_AFFINITY = 5;
const CUE_MAX = 40;
// Lean toward what is rising now, without dropping the steady favourites.
// "medium" swapped Studio Ghibli fans' brands (Vulture, Wired) for trending
// ones unrelated to the seed (a medical association, a bank) when tried live
// on 2026-10-28, so the bias stays low.
const TREND_BIAS = "low";
// Qloo tag families on films and shows that describe a look or a mood,
// not the plot.
const CUE_TAG = /^urn:tag:(?:style|subgenre|theme|genre):/u;

// A Qloo reply that wasn't ok, with its status, so a rejected query (400)
// reads apart from Qloo being down or refusing the key.
export class QlooHttpError extends Error {
  readonly status: number;

  constructor(path: string, status: number) {
    super(`Qloo ${path} answered ${status}`);
    this.name = "QlooHttpError";
    this.status = status;
  }
}

const BAD_REQUEST = 400;
const SEED_TAKE = 3;
// A brief concept's own tags in the theme query, and the tags its fans share
// read to tell which concept a theme belongs to.
const CONCEPT_SIGNAL = 2;
const CONCEPT_NEIGHBOURS = "30";
// A concept's closest tags offered as themes beside the shared query's.
const CONCEPT_THEMES = 5;
// Themes read when the brief's concepts are spread over the query.
const SPREAD_THEMES = "25";
const MAX_TERMS = 4;
const TERM_MAX = 60;
// Clause breaks in a brief: each clause is a candidate entity name.
const CLAUSE_BREAK = /[\n\r\t,;:.!?|/&+()[\]{}"“”«»<>]+|\s[-–—]\s/u;
// Anything but letters, marks, numbers, spaces, apostrophes and hyphens.
const NOT_NAME = /[^\p{L}\p{M}\p{N}\s'’-]+/gu;
const SPACES = /\s+/gu;
const HAS_WORD = /[\p{L}\p{N}]/u;

const termOf = (text: string): string =>
  text.replaceAll(NOT_NAME, " ").replaceAll(SPACES, " ").trim();

// Qloo's /search matches a short entity name ("Studio Ghibli"), not a brief:
// a long or punctuated query answers 400. The terms are the whole seed when
// it is short, then its clauses, cleaned of punctuation, each at most
// TERM_MAX characters, at most MAX_TERMS, without repeats.
export const searchTermsOf = (seed: string): string[] => {
  const seen = new Set<string>();
  return [seed, ...seed.split(CLAUSE_BREAK)]
    .map(termOf)
    .filter((term) => {
      const key = term.toLowerCase();
      const fresh =
        HAS_WORD.test(term) && term.length <= TERM_MAX && !seen.has(key);
      seen.add(key);
      return fresh;
    })
    .slice(0, MAX_TERMS);
};

// The first SEED_TAKE items, each term's best first (one from every term
// before a second from any), without repeats.
const firstOf = <T>(lists: T[][], key: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, rank) =>
    lists.flatMap((list) => list.slice(rank, rank + 1))
  )
    .flat()
    .filter((item) => {
      const fresh = !seen.has(key(item));
      seen.add(key(item));
      return fresh;
    })
    .slice(0, SEED_TAKE);
};

const searchSchema = z.object({
  results: z.array(
    z.object({
      entity_id: z.string().max(128),
      name: z.string().max(300),
      types: z.array(z.string().max(100)).optional(),
    })
  ),
});
type SearchEntity = z.output<typeof searchSchema>["results"][number];

const affinityMap = z.record(z.string().max(40), z.number()).default({});

const demographicsSchema = z.object({
  results: z.object({
    demographics: z
      .array(
        z.object({
          entity_id: z.string().max(200),
          query: z.object({ age: affinityMap, gender: affinityMap }),
        })
      )
      .default([]),
  }),
});

const affinitySchema = z.object({
  results: z.object({
    entities: z
      .array(
        z.object({
          entity_id: z.string().max(128),
          query: z.object({ affinity: z.number().optional() }).optional(),
        })
      )
      .default([]),
  }),
});

const tagsSchema = z.object({
  results: z.object({
    tags: z
      .array(
        z.object({
          id: z.string().max(200).optional(),
          name: z.string().max(200),
          popularity: z.number().optional(),
          query: z.object({ affinity: z.number().optional() }).optional(),
          tag_id: z.string().max(200).optional(),
        })
      )
      .default([]),
  }),
});

// Qloo's descriptive fields vary by entity: read as unknown, and only short
// strings are kept (stringsOf, cueTagsOf).
const entitiesSchema = z.object({
  results: z.object({
    entities: z
      .array(
        z.object({
          entity_id: z.string().max(128),
          name: z.string().max(300),
          popularity: z.number().nullish(),
          properties: z.record(z.string(), z.unknown()).nullish(),
          query: z
            .object({
              affinity: z.number().optional(),
              explainability: z
                .object({
                  "signal.interests.entities": z
                    .array(
                      z.object({
                        entity_id: z.string().max(128),
                        score: z.number(),
                      })
                    )
                    .optional(),
                })
                .optional(),
            })
            .optional(),
          tags: z.array(z.unknown()).optional(),
        })
      )
      .default([]),
  }),
});

// A ranked insights answer for audiences, places (localities) or brands;
// other fields (a locality's properties) are not read.
const rankedSchema = z.object({
  results: z.object({
    entities: z
      .array(
        z.object({
          disambiguation: z.string().max(300).nullish(),
          entity_id: z.string().max(128),
          name: z.string().max(300),
          popularity: z.number().nullish(),
          query: z.object({ affinity: z.number().optional() }).optional(),
        })
      )
      .default([]),
  }),
});

const QLOO_TAG = /^urn:tag:[\w.:-]+$/u;
// A Qloo tag ID ("urn:tag:genre:media:goth"), not a tag's name.
export const isQlooTag = (id: string) => QLOO_TAG.test(id);
const QLOO_ENTITY = /^urn:entity:[\w.:-]+$/u;

// What a designer names as a taste reference: artists, films and brands,
// and the people, books and games behind an aesthetic.
const REFERENCE_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:videogame",
].join(",");

const entitySearchSchema = z.object({
  results: z.array(
    z.object({
      entity_id: z.string().max(128),
      name: z.string().max(300),
      popularity: z.number().optional(),
      types: z.array(z.string().max(100)).optional(),
    })
  ),
});

// An entity Qloo matched for the seed ("artist", "movie", "brand" …) or for
// a taste reference (search).
export interface QlooEntity {
  id: string;
  name: string;
  popularity?: number;
  // The entity's Qloo type, e.g. urn:entity:movie; empty when Qloo gave none.
  type: string;
}

export interface QlooTheme {
  affinity: number;
  // The brief's concepts the tag belongs to (TasteOptions.concepts): the
  // concept's own tag, or one of the tags its fans share.
  concepts?: string[] | undefined;
  id: string;
  name: string;
}

// One entity's demographic lean: Qloo's age buckets ("24_and_younger",
// "25_to_29" … "55_and_older") and genders ("male", "female"), -1 to 1.
export interface QlooDemographics {
  age: Record<string, number>;
  gender: Record<string, number>;
  id: string;
}

// An entity /search found for free text, with all its types.
export interface QlooSearchEntity {
  id: string;
  name: string;
  types: string[];
}

// What the seed's fans also like in another domain, and why: each seed
// entity's share of the recommendation (Qloo's feature.explainability).
export interface QlooAffinity extends QlooEntity {
  affinity: number;
  because: { id: string; name: string; share: number }[];
  // Style and mood words, never names: what the design brief may use.
  cues: string[];
}

export interface Taste {
  // Cross-domain affinities, when asked for (TasteOptions.crossDomain).
  affinities?: QlooAffinity[] | undefined;
  // Domains whose affinities call failed (logged at error level), when
  // cross-domain affinities were asked for.
  failedDomains?: AffinityType[] | undefined;
  // The brief's concepts Qloo knows as tags (TasteOptions.concepts).
  concepts?: string[] | undefined;
  // Brands, artists and titles Qloo matched: ideas must never print them.
  names: string[];
  // The entities Qloo matched for the seed, when asked for.
  seeds?: QlooEntity[] | undefined;
  // Tags the seed's fans share, highest affinity first.
  themes: QlooTheme[];
}

// One insights query (docs.qloo.com/reference/insights-api-deep-dive):
// entities of one type that the given signals' fans like. The hackathon
// server answers 400 to demographics alone, so a query carries entities or
// audiences too.
// What "who buys" is asked about: Qloo entity IDs and Qloo tag IDs.
export interface WhoSignals {
  entities?: readonly string[] | undefined;
  tags?: readonly string[] | undefined;
}

// A Qloo audience, place (locality) or brand ranked for the
// signals; `where` is Qloo's disambiguation ("Salem, Essex County,
// Massachusetts, United States of America"; "Tattoos (Hobbies And
// Interests)").
export interface QlooRanked {
  affinity: number;
  id: string;
  name: string;
  popularity?: number | undefined;
  where?: string | undefined;
}

export interface InsightsQuery {
  // Qloo age buckets, e.g. "25_to_29".
  age?: string | undefined;
  audiences?: readonly string[] | undefined;
  entities?: readonly string[] | undefined;
  gender?: "female" | "male" | undefined;
  take: number;
  // How much what is rising now counts (Qloo's bias.trends).
  trends?: "high" | "low" | "medium" | "off" | undefined;
  type: AffinityType | "artist";
}

// An entity an insights query found, with Qloo's affinity to the signals
// and its popularity percentile, each 0 to 1.
export interface QlooInsight extends QlooEntity {
  affinity: number;
  popularity: number;
}

// One key concept of the brief ("gothic", "botanical", "dark academia")
// and the brief's phrases that say it ("botanical", "plant").
export interface BriefConcept {
  name: string;
  phrases: string[];
}

export interface TasteOptions {
  // The brief's key concepts: the themes come from all of them at once,
  // each concept weighed alike, and each theme says which it belongs to.
  concepts?: readonly BriefConcept[] | undefined;
  // Also ask which brands, films and shows the seed's fans like, with
  // explainability and a trend bias, in every run.
  crossDomain?: boolean | undefined;
  // The terms to search Qloo for, entities and tags; the brief's own
  // clauses when not given.
  terms?: readonly string[] | undefined;
}

const typeOf = (urn: string | undefined) => urn?.split(":").at(-1) ?? "";

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const cueTagsOf = (tags: unknown[] | undefined): string[] =>
  (tags ?? []).flatMap((tag) => {
    if (typeof tag !== "object" || tag === null) {
      return [];
    }
    const { name, type } = tag as { name?: unknown; type?: unknown };
    return typeof name === "string" &&
      typeof type === "string" &&
      CUE_TAG.test(type)
      ? [name]
      : [];
  });

// Short, distinct cues; Qloo writes "null" for a missing value.
const distinctCues = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .flatMap((value) => {
      const cue = value.trim().slice(0, CUE_MAX);
      const key = cue.toLowerCase();
      if (cue === "" || key === "null" || seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [cue];
    })
    .slice(0, CUES_PER_AFFINITY);
};

type Entities = z.output<typeof entitiesSchema>["results"]["entities"];

const affinitiesOf = (
  type: string,
  entities: Entities,
  seeds: QlooEntity[]
): QlooAffinity[] =>
  entities.map((entity) => {
    const shares =
      entity.query?.explainability?.["signal.interests.entities"] ?? [];
    return {
      affinity: entity.query?.affinity ?? 0,
      because: shares.flatMap(({ entity_id, score }) => {
        const seed = seeds.find(({ id }) => id === entity_id);
        return seed === undefined
          ? []
          : [{ id: seed.id, name: seed.name, share: score }];
      }),
      cues: distinctCues([
        ...stringsOf(entity.properties?.["personal_style"]),
        ...stringsOf(entity.properties?.["emotional_tone"]),
        ...cueTagsOf(entity.tags),
      ]),
      id: entity.entity_id,
      name: entity.name.trim(),
      type,
    };
  });

// One key per tag name: "JPop" and " J-pop" are one tag.
const tagKey = (name: string) =>
  name.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");

// Qloo lists spelling variants of one tag ("JPop", " J-pop"): keep the
// highest-affinity one.
const dedupeThemes = (themes: QlooTheme[]): QlooTheme[] => {
  const seen = new Set<string>();
  return themes
    .toSorted((a, b) => b.affinity - a.affinity)
    .filter(({ name }) => {
      const key = tagKey(name);
      const fresh = key !== "" && !seen.has(key);
      seen.add(key);
      return fresh;
    });
};

const themesFrom = (tags: z.output<typeof tagsSchema>): QlooTheme[] => {
  const themes = tags.results.tags.flatMap((tag) => {
    const id = tag.id ?? tag.tag_id ?? "";
    const affinity = tag.query?.affinity ?? tag.popularity ?? 0;
    return QLOO_TAG.test(id)
      ? [{ affinity, id, name: tag.name.trim().slice(0, THEME_MAX) }]
      : [];
  });
  return dedupeThemes(themes);
};

// The signal parameters of a "who buys" query.
const signalParams = ({ entities = [], tags = [] }: WhoSignals) => ({
  ...(entities.length > 0 && {
    "signal.interests.entities": entities.join(","),
  }),
  ...(tags.length > 0 && { "signal.interests.tags": tags.join(",") }),
});

export const createQloo = ({ apiKey, baseURL }: QlooConfig) => {
  // At most QLOO_CONCURRENCY requests in flight per client: the hackathon
  // server answers 429 to a burst (brand discovery's twelve insights calls
  // did, tried live on 2026-10-29). A 429 is retried up to
  // RATE_LIMIT_RETRIES times with jittered backoff; a 5xx, timeout or network
  // failure RETRIES times; any other failure is final.
  const limit = pLimit(QLOO_CONCURRENCY);
  // Qloo's answers, kept a while per URL: the same request (a brand's
  // references, an audience) is asked again within minutes by the new-drop
  // suggestions, discovery and the taste map. A request in flight is
  // shared; a failed one is forgotten.
  const answers = new Map<string, { at: number; body: Promise<unknown> }>();
  const remember = (key: string, body: Promise<unknown>) => {
    answers.delete(key);
    answers.set(key, { at: Date.now(), body });
    for (const oldest of answers.keys()) {
      if (answers.size <= ANSWERS_KEPT) {
        break;
      }
      answers.delete(oldest);
    }
  };

  const fetchJson = async (
    path: string,
    query: Record<string, string>,
    key: string,
    timeoutMs: number
  ): Promise<unknown> => {
    // Failures other than a 429 get RETRIES retries of their own, however many
    // 429s came first.
    let transientFailures = 0;
    const response = await limit(
      async () =>
        await pRetry(
          async () => {
            const reply = await fetch(
              // Qloo's configured base URL; path is one of this file's
              // literals and query is encoded, so no input picks the host.
              // nosemgrep
              new URL(`${path}?${new URLSearchParams(query)}`, baseURL),
              {
                headers: { Accept: "application/json", "X-Api-Key": key },
                signal: AbortSignal.timeout(timeoutMs),
              }
            );
            const error = new QlooHttpError(path, reply.status);
            if (reply.status === TOO_MANY || reply.status >= SERVER_ERROR) {
              throw error;
            }
            if (!reply.ok) {
              throw new AbortError(error);
            }
            return reply;
          },
          {
            minTimeout: RETRY_MS,
            randomize: true,
            retries: RATE_LIMIT_RETRIES,
            shouldRetry: ({ error }) => {
              if (error instanceof QlooHttpError && error.status === TOO_MANY) {
                return true;
              }
              transientFailures += 1;
              const timedOut =
                error instanceof Error && error.name === "TimeoutError";
              return (
                transientFailures <= (timedOut ? TIMEOUT_RETRIES : RETRIES)
              );
            },
          }
        )
    );
    return await response.json();
  };

  const get = async <T extends z.ZodType>(
    path: string,
    query: Record<string, string>,
    schema: T,
    timeoutMs = TIMEOUT_MS
  ): Promise<z.output<T>> => {
    if (apiKey === undefined) {
      throw notConfigured.qloo();
    }
    const url = `${path}?${new URLSearchParams(query)}`;
    const cached = answers.get(url);
    if (cached !== undefined && Date.now() - cached.at < ANSWER_TTL_MS) {
      return schema.parse(await cached.body);
    }
    const body = fetchJson(path, query, apiKey, timeoutMs);
    remember(url, body);
    try {
      return schema.parse(await body);
    } catch (error) {
      answers.delete(url);
      throw error;
    }
  };

  // One domain's affinities. Best effort: a failure is logged at error level,
  // recorded as `failed` so the taste map can say so, and the rest of the
  // taste stands.
  const affinitiesIn = async (
    type: AffinityType,
    seeds: QlooEntity[],
    log?: Logger
  ): Promise<{
    affinities: QlooAffinity[];
    failed: boolean;
    type: AffinityType;
  }> => {
    try {
      const reply = await external(
        log,
        { operation: `affinities.${type}`, provider: "qloo" },
        async () =>
          await get(
            "/v2/insights",
            {
              "bias.trends": TREND_BIAS,
              "feature.explainability": "true",
              "filter.type": `urn:entity:${type}`,
              "signal.interests.entities": seeds.map(({ id }) => id).join(","),
              take: AFFINITIES_PER_TYPE,
            },
            entitiesSchema
          )
      );
      return {
        affinities: affinitiesOf(type, reply.results.entities, seeds),
        failed: false,
        type,
      };
    } catch (error) {
      log?.error?.(error instanceof Error ? error : new Error(String(error)));
      return { affinities: [], failed: true, type };
    }
  };

  // One search term's entities. Qloo answers 400 to a term it can't parse:
  // that term has no match and the others still count. Any other failure
  // (auth, 429, 5xx) is final.
  const termEntities = async (
    term: string
  ): Promise<{ entities: SearchEntity[]; rejected?: QlooHttpError }> => {
    try {
      const { results } = await get(
        "/search",
        { query: term, take: String(SEED_TAKE), types: SEED_TYPES },
        searchSchema
      );
      return { entities: results };
    } catch (error) {
      if (error instanceof QlooHttpError && error.status === BAD_REQUEST) {
        return { entities: [], rejected: error };
      }
      throw error;
    }
  };

  // One term's taste tags: a concept like "dark academia" or "gothic" is a
  // Qloo tag, not an entity /search finds. A 400 is no match.
  const termTags = async (term: string): Promise<string[]> => {
    try {
      const { results } = await get(
        "/v2/tags",
        {
          "filter.query": term,
          "filter.tag.types": THEME_TAG_TYPES,
          take: String(SEED_TAKE),
        },
        tagsSchema
      );
      return results.tags.flatMap((tag) => {
        const id = tag.id ?? tag.tag_id ?? "";
        return QLOO_TAG.test(id) ? [id] : [];
      });
    } catch (error) {
      if (error instanceof QlooHttpError && error.status === BAD_REQUEST) {
        return [];
      }
      throw error;
    }
  };

  // The terms' entities and tags, at most SEED_TAKE of each. When Qloo
  // rejects every term's entity search the request itself is wrong, so the
  // step fails with Qloo's answer.
  const termsMatches = async (
    terms: readonly string[],
    log?: Logger
  ): Promise<{ entities: SearchEntity[]; tags: string[] }> => {
    if (terms.length === 0) {
      return { entities: [], tags: [] };
    }
    const found = await Promise.all(
      terms.map(async (term) => {
        const [named, tags] = await Promise.all([
          termEntities(term),
          termTags(term),
        ]);
        return { ...named, tags };
      })
    );
    const rejected = found.flatMap(({ rejected: error }) =>
      error === undefined ? [] : [error]
    );
    log?.set({ qloo: { rejectedTerms: rejected.length, terms: terms.length } });
    const [firstRejected] = rejected;
    if (
      firstRejected !== undefined &&
      rejected.length === terms.length &&
      found.every(({ tags }) => tags.length === 0)
    ) {
      throw firstRejected;
    }
    return {
      entities: firstOf(
        found.map(({ entities }) => entities),
        ({ entity_id: id }) => id
      ),
      tags: firstOf(
        found.map(({ tags }) => tags),
        (id) => id
      ),
    };
  };

  // The seed matches when any term names an entity or a tag. A brief that
  // describes rather than names ("Retro 70s graphic tees for coffee lovers",
  // or a direction's own title) may match nothing as a whole: its subject
  // words are searched next, so it still finds an audience.
  const seedMatches = async (
    seed: string,
    log?: Logger,
    given?: readonly string[]
  ) => {
    const terms = given ?? searchTermsOf(seed);
    const tried = new Set(terms.map((term) => term.toLowerCase()));
    const keywords = keywordsOf(seed).filter((word) => !tried.has(word));
    try {
      const matched = await termsMatches(terms, log);
      if (matched.entities.length > 0 || matched.tags.length > 0) {
        return matched;
      }
    } catch (error) {
      // Qloo rejected every term: its subject words may still pass.
      const rejected =
        error instanceof QlooHttpError && error.status === BAD_REQUEST;
      if (!rejected || keywords.length === 0) {
        throw error;
      }
    }
    return await termsMatches(keywords, log);
  };

  // The seed's entities and tags, and the tags their fans share; with
  // crossDomain, also what the entities' fans like in other domains, and why.
  // Each concept's tags, and the tags its fans share (its neighbourhood),
  // for the concepts Qloo knows. A failed neighbourhood read is logged at
  // error level and leaves that concept with its own tags only.
  const conceptsOf = async (
    concepts: readonly BriefConcept[],
    log?: Logger
  ) => {
    const known = await Promise.all(
      concepts.map(async (concept) => {
        const found = await Promise.all(
          concept.phrases.map(async (phrase) => {
            const ids = await termTags(phrase);
            // The phrase's own tag ("gothic"), not one that only starts
            // with it ("Dark" for "dark academia").
            const slug = phrase.trim().toLowerCase().replaceAll(/\s+/gu, "_");
            const own = ids.filter((id) => id.split(":").at(-1) === slug);
            return own.length > 0 ? own : ids.slice(0, 1);
          })
        );
        const tags = firstOf(found, (id) => id).slice(0, CONCEPT_SIGNAL);
        return { concept, tags };
      })
    );
    const matched = known.filter(({ tags }) => tags.length > 0);
    return await Promise.all(
      matched.map(async ({ concept: { name, phrases }, tags }) => {
        // The concept's own words name its tag too ("Gothic" is gothic).
        const own = [name, ...phrases].map(tagKey);
        try {
          const near = await get(
            "/v2/insights",
            {
              "filter.tag.types": THEME_TAG_TYPES,
              "filter.type": "urn:tag",
              "signal.interests.tags": tags.join(","),
              take: CONCEPT_NEIGHBOURS,
            },
            tagsSchema
          );
          return {
            keys: new Set([
              ...own,
              ...near.results.tags.map((tag) => tagKey(tag.name)),
            ]),
            name,
            near: themesFrom(near).slice(0, CONCEPT_THEMES),
            tags,
          };
        } catch (error) {
          log?.error?.(
            error instanceof Error ? error : new Error(String(error))
          );
          return { keys: new Set(own), name, near: [], tags };
        }
      })
    );
  };

  const tasteOf = async (
    seed: string,
    log?: Logger,
    { concepts = [], crossDomain = false, terms }: TasteOptions = {}
  ): Promise<Taste> =>
    await external(log, { operation: "taste", provider: "qloo" }, async () => {
      const [{ entities, tags: matchedTags }, known] = await Promise.all([
        seedMatches(seed, log, terms),
        conceptsOf(concepts, log),
      ]);
      // With the brief's concepts known, the themes come from all of them,
      // each weighed alike: one concept's entities (a dark-academia book)
      // would otherwise pull every theme its way.
      const spread = known.length > 1;
      const seedTags = spread ? known.flatMap(({ tags }) => tags) : matchedTags;
      const conceptsOfTheme = (theme: QlooTheme) =>
        known
          .filter(
            ({ keys, tags }) =>
              tags.includes(theme.id) || keys.has(tagKey(theme.name))
          )
          .map(({ name }) => name);
      const withConcepts = (themes: QlooTheme[]) =>
        known.length === 0
          ? themes
          : themes.map((theme) => ({
              ...theme,
              concepts: conceptsOfTheme(theme),
            }));
      if (entities.length === 0 && seedTags.length === 0) {
        return crossDomain
          ? {
              affinities: [],
              failedDomains: [],
              names: [],
              seeds: [],
              themes: [],
            }
          : { names: [], themes: [] };
      }
      const seeds = entities.map((entity) => ({
        id: entity.entity_id,
        name: entity.name.trim(),
        type: typeOf(entity.types?.[0]),
      }));
      const [tags, ...domains] = await Promise.all([
        get(
          "/v2/insights",
          {
            "filter.tag.types": THEME_TAG_TYPES,
            "filter.type": "urn:tag",
            ...(seeds.length > 0 &&
              !spread && {
                "signal.interests.entities": seeds
                  .map(({ id }) => id)
                  .join(","),
              }),
            ...(seedTags.length > 0 && {
              "signal.interests.tags": seedTags.join(","),
            }),
            take: spread ? SPREAD_THEMES : "10",
            ...(crossDomain && { "bias.trends": TREND_BIAS }),
          },
          tagsSchema
        ),
        ...(crossDomain && seeds.length > 0
          ? AFFINITY_TYPES.map(
              async (type) => await affinitiesIn(type, seeds, log)
            )
          : []),
      ]);
      const names = seeds.map(({ name }) => name);
      // Each concept's own closest tags join the themes, so a concept the
      // others outweigh in the shared query still has a theme to lead.
      const themes = withConcepts(
        dedupeThemes([
          ...themesFrom(tags),
          ...known.flatMap(({ near }) => near),
        ])
      );
      const conceptNames =
        known.length === 0 ? {} : { concepts: known.map(({ name }) => name) };
      if (!crossDomain) {
        return { ...conceptNames, names, themes };
      }
      const affinities = domains.flatMap((domain) => domain.affinities);
      return {
        affinities,
        failedDomains: domains
          .filter(({ failed }) => failed)
          .map(({ type }) => type),
        names: [...names, ...affinities.map(({ name }) => name)],
        seeds,
        themes,
        ...conceptNames,
      };
    });

  // Qloo's age and gender affinity for the given entities, one block per
  // entity (urn:demographics, docs.qloo.com/reference/demographics-use-case).
  // Scores run -1 to 1; positive means stronger than average.
  const demographicsOf = async (
    entityIds: readonly string[],
    log?: Logger
  ): Promise<QlooDemographics[]> =>
    await external(
      log,
      { operation: "demographics", provider: "qloo" },
      async () => {
        if (entityIds.length === 0) {
          return [];
        }
        const { results } = await get(
          "/v2/insights",
          {
            "filter.type": "urn:demographics",
            "signal.interests.entities": entityIds.join(","),
          },
          demographicsSchema
        );
        return results.demographics.map(({ entity_id: id, query }) => ({
          age: query.age,
          gender: query.gender,
          id,
        }));
      }
    );

  // How much one Qloo audience (urn:audience:…) likes the given entities of
  // one type, each 0 to 1. Qloo answers a flat baseline for entities it has
  // no audience data on, so callers compare audiences, not raw values.
  const audienceAffinity = async (
    audienceId: string,
    type: string,
    entityIds: readonly string[],
    log?: Logger
  ): Promise<number[]> =>
    await external(
      log,
      { operation: "audience_affinity", provider: "qloo" },
      async () => {
        if (entityIds.length === 0) {
          return [];
        }
        const { results } = await get(
          "/v2/insights",
          {
            "filter.results.entities": entityIds.join(","),
            "filter.type": type,
            "signal.demographics.audiences": audienceId,
            take: String(entityIds.length),
          },
          affinitySchema
        );
        return results.entities.flatMap((entity) =>
          entity.query?.affinity === undefined ? [] : [entity.query.affinity]
        );
      }
    );

  // Qloo entities for free text, e.g. a merchant's taste references.
  const searchEntities = async (
    query: string,
    types: readonly string[],
    take: number,
    log?: Logger
  ): Promise<QlooSearchEntity[]> =>
    await external(log, { operation: "search", provider: "qloo" }, async () => {
      const { results } = await get(
        "/search",
        { query, take: String(take), types: types.join(",") },
        searchSchema
      );
      return results.map((entity) => ({
        id: entity.entity_id,
        name: entity.name,
        types: entity.types ?? [],
      }));
    });

  // Qloo entities named like the query, best match first, across every
  // entity a designer can name as a taste reference.
  const search = async (
    query: string,
    { log, take = 1 }: { log?: Logger | undefined; take?: number } = {}
  ): Promise<QlooEntity[]> =>
    await external(log, { operation: "search", provider: "qloo" }, async () => {
      const { results } = await get(
        "/search",
        { query, take: String(take), types: REFERENCE_TYPES },
        entitySearchSchema
      );
      return results.map((entity) => ({
        id: entity.entity_id,
        name: entity.name,
        type: entity.types?.find((type) => QLOO_ENTITY.test(type)) ?? "",
        ...(entity.popularity === undefined
          ? {}
          : { popularity: entity.popularity }),
      }));
    });

  // Entities of one type the query's signals like, highest affinity first.
  const insights = async (
    {
      age,
      audiences = [],
      entities = [],
      gender,
      take,
      trends,
      type,
    }: InsightsQuery,
    log?: Logger
  ): Promise<QlooInsight[]> =>
    await external(
      log,
      { operation: `insights.${type}`, provider: "qloo" },
      async () => {
        const { results } = await get(
          "/v2/insights",
          {
            "filter.type": `urn:entity:${type}`,
            take: String(take),
            ...(entities.length > 0 && {
              "signal.interests.entities": entities.join(","),
            }),
            ...(audiences.length > 0 && {
              "signal.demographics.audiences": audiences.join(","),
            }),
            ...(age !== undefined && { "signal.demographics.age": age }),
            ...(gender !== undefined && {
              "signal.demographics.gender": gender,
            }),
            ...(trends !== undefined && { "bias.trends": trends }),
          },
          entitiesSchema
        );
        return results.entities.map((entity) => ({
          affinity: entity.query?.affinity ?? 0,
          id: entity.entity_id,
          name: entity.name.trim(),
          popularity: entity.popularity ?? 0,
          type,
        }));
      }
    );

  // The Qloo tag IDs a name finds (/v2/tags), best first: an idea saved
  // with its theme's name instead of its tag ID reads its tag this way.
  const tagsNamed = async (name: string, log?: Logger): Promise<string[]> =>
    await external(
      log,
      { operation: "tags.search", provider: "qloo" },
      async () => await termTags(name)
    );

  // The genre tags the given entities' fans share, highest affinity first.
  const tagsFor = async (
    entityIds: readonly string[],
    log?: Logger,
    take = 8
  ): Promise<QlooTheme[]> =>
    await external(log, { operation: "tags", provider: "qloo" }, async () => {
      if (entityIds.length === 0) {
        return [];
      }
      return themesFrom(
        await get(
          "/v2/insights",
          {
            "filter.tag.types": THEME_TAG_TYPES,
            "filter.type": "urn:tag",
            "signal.interests.entities": entityIds.join(","),
            take: String(take),
          },
          tagsSchema
        )
      );
    });

  const ranked = async (
    operation: string,
    query: Record<string, string>,
    log?: Logger,
    timeoutMs = TIMEOUT_MS
  ): Promise<QlooRanked[]> =>
    await external(log, { operation, provider: "qloo" }, async () => {
      const { results } = await get(
        "/v2/insights",
        query,
        rankedSchema,
        timeoutMs
      );
      return results.entities.map((entity) => ({
        affinity: entity.query?.affinity ?? 0,
        id: entity.entity_id,
        name: entity.name.trim(),
        ...(entity.popularity !== null &&
          entity.popularity !== undefined && {
            popularity: entity.popularity,
          }),
        ...(entity.disambiguation !== null &&
          entity.disambiguation !== undefined && {
            where: entity.disambiguation.trim(),
          }),
      }));
    });

  // The Qloo audiences (urn:audience) whose members like the signals most.
  const audiencesOf = async (signals: WhoSignals, log?: Logger, take = 5) =>
    await ranked(
      "who.audiences",
      {
        "filter.type": "urn:audience",
        take: String(take),
        ...signalParams(signals),
      },
      log
    );

  // Where the signals' fans are: the localities (cities, counties) Qloo
  // ranks for them within a location ("United States"). Not the heatmap
  // (filter.type=urn:heatmap): it ignores `take` and sent 200 MB of
  // boundary polygons for the United States, tried live on 2026-10-29.
  // Ranked localities take about 25 s on the hackathon server, so this
  // call waits longer than the others.
  const placesOf = async (
    signals: WhoSignals,
    location: string,
    log?: Logger,
    take = 5
  ) =>
    await ranked(
      "who.places",
      {
        "filter.location.query": location,
        "filter.type": "urn:entity:locality",
        take: String(take),
        ...signalParams(signals),
      },
      log,
      PLACES_TIMEOUT_MS
    );

  // The fashion brands the signals' fans like: who they already buy from.
  const fashionBrandsOf = async (signals: WhoSignals, log?: Logger, take = 3) =>
    await ranked(
      "who.brands",
      {
        "filter.tags": "urn:tag:genre:brand:fashion",
        "filter.type": "urn:entity:brand",
        take: String(take),
        ...signalParams(signals),
      },
      log
    );

  return {
    audienceAffinity,
    audiencesOf,
    demographicsOf,
    fashionBrandsOf,
    insights,
    placesOf,
    search,
    searchEntities,
    tagsFor,
    tagsNamed,
    tasteOf,
  };
};

export type Qloo = ReturnType<typeof createQloo>;
