import {
  agesSchema,
  gendersSchema,
  isQlooTag,
  pointSchema,
  THEME_MAX,
} from "@wovain/shared/trends";
import type { Audience } from "@wovain/shared/trends";
import { z } from "zod";

import { fetchJson } from "./fetch-json.ts";
import { clip } from "./tavily.ts";
import { logErrorClass } from "./tool-result.ts";

// Qloo's Taste API over REST. The hackathon kit's one package
// (@qloo/qloo-harness) is a CLI and stdio MCP server that doesn't export its
// client, so wovain sends the same requests its workflows do (entity_tags,
// trends, audience_demographics, where_popular). Hackathon keys work only on
// this host. Only the seed and Qloo IDs go to Qloo, never merchant data, and
// what comes back is aggregate taste, treated as untrusted data.
const QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 15_000;
const SEED_ENTITIES = 3;
const TAGS = 10;
const LOCATIONS = 5;
const TREND_DAYS = 28;
const DAY_MS = 86_400_000;

type Query = Record<string, number | string>;
export type QlooGet = <T extends z.ZodType>(
  path: string,
  query: Query,
  schema: T
) => Promise<z.output<T>>;

// Undefined without a key: research then works without Qloo.
export const qlooFor = (apiKey?: string): QlooGet | undefined =>
  apiKey === undefined
    ? undefined
    : async (path, query, schema) => {
        const url = new URL(path, QLOO_BASE_URL);
        for (const [key, value] of Object.entries(query)) {
          url.searchParams.set(key, String(value));
        }
        return await fetchJson(url, schema, {
          headers: { Accept: "application/json", "X-Api-Key": apiKey },
          label: "Qloo",
          timeoutMs: TIMEOUT_MS,
        });
      };

// Qloo ignores parameters it doesn't know, and the hackathon key can't be
// tried yet, so every field past the IDs is optional: a different shape
// means fewer signals, not an error.
const scoreSchema = z.object({ affinity: z.number().optional() }).optional();

const searchSchema = z.object({
  results: z.array(
    z.object({
      entity_id: z.string().max(128),
      name: z.string().max(300),
      types: z.array(z.string().max(64)).optional(),
    })
  ),
});

const tagsSchema = z.object({
  results: z.object({
    tags: z.array(
      z.object({
        id: z.string().max(200).optional(),
        name: z.string().max(200),
        popularity: z.number().optional(),
        query: scoreSchema,
        tag_id: z.string().max(200).optional(),
      })
    ),
  }),
});

const trendingSchema = z.object({
  results: z.object({
    trending: z.array(
      z.object({ population_rank_velocity: z.number().optional() })
    ),
  }),
});

const demographicsSchema = z.object({
  results: z.object({
    demographics: z.array(
      z.object({
        query: z
          .object({
            age: agesSchema.optional(),
            gender: gendersSchema.optional(),
          })
          .optional(),
      })
    ),
  }),
});

const heatmapSchema = z.object({
  results: z.object({
    heatmap: z.array(
      z.object({
        location: pointSchema,
        query: scoreSchema,
      })
    ),
  }),
});

export interface Theme {
  affinity: number;
  id: string;
  name: string;
}

export interface Taste {
  // Names of the brands, artists and titles Qloo matched: the IP ideas
  // must never use.
  names: string[];
  themes: Theme[];
  // The seed's rank velocity over the past 4 weeks, when Qloo has one.
  velocity?: number;
}

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

// The seed's first entity's latest rank velocity. A failure only leaves
// velocity out.
const velocityOf = async (
  qloo: QlooGet,
  entityId: string,
  type: string
): Promise<number | undefined> => {
  const now = Date.now();
  const { results } = await qloo(
    "/v2/trending",
    {
      "filter.end_date": isoDay(now),
      "filter.start_date": isoDay(now - TREND_DAYS * DAY_MS),
      "filter.type": type,
      "signal.interests.entities": entityId,
    },
    trendingSchema
  ).catch((error: unknown) => {
    logErrorClass("research_trends Qloo trending skipped:", error);
    return { results: { trending: [] } };
  });
  return results.trending.at(-1)?.population_rank_velocity;
};

// The seed's taste graph: its entities, the cross-domain tags their fans
// share (highest affinity first) and the seed's velocity. Undefined when
// Qloo matches nothing.
export const tasteOf = async (
  qloo: QlooGet,
  seed: string
): Promise<Taste | undefined> => {
  const { results: entities } = await qloo(
    "/search",
    { query: seed, take: SEED_ENTITIES },
    searchSchema
  );
  const [first] = entities;
  if (first === undefined) {
    return undefined;
  }
  const type = first.types?.find((value) => value.startsWith("urn:entity:"));
  const [{ results }, velocity] = await Promise.all([
    qloo(
      "/v2/insights",
      {
        "filter.type": "urn:tag",
        "signal.interests.entities": entities
          .map((entity) => entity.entity_id)
          .join(","),
        take: TAGS,
      },
      tagsSchema
    ),
    type === undefined ? undefined : velocityOf(qloo, first.entity_id, type),
  ]);
  const themes = results.tags
    .flatMap(({ id, name, popularity, query, tag_id: tagId }) => {
      const tag = id ?? tagId ?? "";
      return isQlooTag(tag)
        ? [
            {
              affinity: query?.affinity ?? popularity ?? 0,
              id: tag,
              name: clip(name, THEME_MAX),
            },
          ]
        : [];
    })
    .toSorted((a, b) => b.affinity - a.affinity);
  return {
    names: entities.map((entity) => entity.name),
    themes,
    ...(velocity === undefined ? {} : { velocity }),
  };
};

// Who loves a theme and where: affinity by age band and gender, and the
// places with the highest affinity.
export const audienceOf = async (
  qloo: QlooGet,
  tags: string[],
  within: string
): Promise<Audience> => {
  const signal = { "signal.interests.tags": tags.join(",") };
  const [demographics, heatmap] = await Promise.all([
    qloo(
      "/v2/insights",
      { ...signal, "filter.type": "urn:demographics" },
      demographicsSchema
    ),
    qloo(
      "/v2/insights",
      {
        ...signal,
        "filter.location.query": within,
        "filter.type": "urn:heatmap",
      },
      heatmapSchema
    ),
  ]);
  const query = demographics.results.demographics[0]?.query;
  return {
    ...(query?.age === undefined ? {} : { ages: query.age }),
    ...(query?.gender === undefined ? {} : { genders: query.gender }),
    locations: heatmap.results.heatmap
      .toSorted(
        (a, b) =>
          (b.query?.affinity ?? -Infinity) - (a.query?.affinity ?? -Infinity)
      )
      .slice(0, LOCATIONS)
      .map(({ location, query: score }) => ({
        ...location,
        ...(score?.affinity === undefined ? {} : { affinity: score.affinity }),
      })),
  };
};
