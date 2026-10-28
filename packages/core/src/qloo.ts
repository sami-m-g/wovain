import { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

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

const TIMEOUT_MS = 15_000;

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

const searchSchema = z.object({
  results: z.array(
    z.object({
      entity_id: z.string().max(128),
      name: z.string().max(300),
      types: z.array(z.string().max(100)).optional(),
    })
  ),
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

const QLOO_TAG = /^urn:tag:[\w.:-]+$/u;

export interface QlooTheme {
  affinity: number;
  id: string;
  name: string;
}

// An entity Qloo matched for the seed: "artist", "movie", "brand" …
export interface QlooEntity {
  id: string;
  name: string;
  type: string;
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
  // Brands, artists and titles Qloo matched: ideas must never print them.
  names: string[];
  // The entities Qloo matched for the seed, when asked for.
  seeds?: QlooEntity[] | undefined;
  // Tags the seed's fans share, highest affinity first.
  themes: QlooTheme[];
}

export interface TasteOptions {
  // Also ask which brands, films and shows the seed's fans like, with
  // explainability and a trend bias (the qloo-taste-map flag).
  crossDomain?: boolean | undefined;
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

const themesFrom = (tags: z.output<typeof tagsSchema>): QlooTheme[] => {
  const themes = tags.results.tags.flatMap((tag) => {
    const id = tag.id ?? tag.tag_id ?? "";
    const affinity = tag.query?.affinity ?? tag.popularity ?? 0;
    return QLOO_TAG.test(id)
      ? [{ affinity, id, name: tag.name.trim().slice(0, THEME_MAX) }]
      : [];
  });
  // Qloo lists spelling variants of one tag ("JPop", " J-pop"): keep the
  // highest-affinity one.
  const seen = new Set<string>();
  return themes
    .toSorted((a, b) => b.affinity - a.affinity)
    .filter(({ name }) => {
      const key = name.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");
      const fresh = key !== "" && !seen.has(key);
      seen.add(key);
      return fresh;
    });
};

export const createQloo = ({ apiKey, baseURL }: QlooConfig) => {
  const get = async <T extends z.ZodType>(
    path: string,
    query: Record<string, string>,
    schema: T
  ): Promise<z.output<T>> => {
    if (apiKey === undefined) {
      throw notConfigured.qloo();
    }
    const response = await fetch(
      // Qloo's configured base URL; path is one of this file's literals and
      // query is encoded, so no input picks the host.
      // nosemgrep
      new URL(`${path}?${new URLSearchParams(query)}`, baseURL),
      {
        headers: { Accept: "application/json", "X-Api-Key": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      throw new Error(`Qloo ${path} answered ${response.status}`);
    }
    return schema.parse(await response.json());
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

  // The seed's entities and the tags their fans share; with crossDomain,
  // also what they like in other domains, and why.
  const tasteOf = async (
    seed: string,
    log?: Logger,
    { crossDomain = false }: TasteOptions = {}
  ): Promise<Taste> =>
    await external(log, { operation: "taste", provider: "qloo" }, async () => {
      const { results: entities } = await get(
        "/search",
        { query: seed, take: "3", types: SEED_TYPES },
        searchSchema
      );
      if (entities.length === 0) {
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
            "signal.interests.entities": seeds.map(({ id }) => id).join(","),
            take: "10",
            ...(crossDomain && { "bias.trends": TREND_BIAS }),
          },
          tagsSchema
        ),
        ...(crossDomain
          ? AFFINITY_TYPES.map(
              async (type) => await affinitiesIn(type, seeds, log)
            )
          : []),
      ]);
      const names = seeds.map(({ name }) => name);
      if (!crossDomain) {
        return { names, themes: themesFrom(tags) };
      }
      const affinities = domains.flatMap((domain) => domain.affinities);
      return {
        affinities,
        failedDomains: domains
          .filter(({ failed }) => failed)
          .map(({ type }) => type),
        names: [...names, ...affinities.map(({ name }) => name)],
        seeds,
        themes: themesFrom(tags),
      };
    });

  return { tasteOf };
};

export type Qloo = ReturnType<typeof createQloo>;
