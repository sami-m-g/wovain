import { audienceSchema, isQlooTag, THEME_MAX } from "@wovain/shared/trends";
import { z } from "zod";

import { fetchJson } from "./fetch-json.ts";
import { clip } from "./tavily.ts";
import { logErrorClass } from "./tool-result.ts";

// Qloo's Taste API over REST: the hackathon kit's @qloo/qloo-harness doesn't
// export a client. Only the seed and Qloo IDs go to Qloo, and its answers are
// untrusted data. Every field past the IDs is optional: a different shape
// means fewer signals, not an error.
const QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const DAY_MS = 86_400_000;

export type QlooGet = <T extends z.ZodType>(
  path: string,
  query: Record<string, string>,
  schema: T
) => Promise<z.output<T>>;

export const qlooFor = (apiKey?: string): QlooGet | undefined =>
  apiKey === undefined
    ? undefined
    : async (path, query, schema) =>
        await fetchJson(
          new URL(`${path}?${new URLSearchParams(query)}`, QLOO_BASE_URL),
          schema,
          {
            headers: { Accept: "application/json", "X-Api-Key": apiKey },
            label: "Qloo",
            timeoutMs: 15_000,
          }
        );

const affinity = z.object({ affinity: z.number().optional() }).optional();
const results = <T extends z.ZodType>(key: string, item: T) =>
  z.object({ results: z.object({ [key]: z.array(item) }) });

const searchSchema = z.object({
  results: z.array(
    z.object({
      entity_id: z.string().max(128),
      name: z.string().max(300),
      types: z.array(z.string().max(64)).optional(),
    })
  ),
});
const tagsSchema = results(
  "tags",
  z.object({
    id: z.string().max(200).optional(),
    name: z.string().max(200),
    popularity: z.number().optional(),
    query: affinity,
    tag_id: z.string().max(200).optional(),
  })
);
const trendingSchema = results(
  "trending",
  z.object({ population_rank_velocity: z.number().optional() })
);
const demographicsSchema = results(
  "demographics",
  z.object({
    query: z
      .object({
        age: audienceSchema.shape.ages,
        gender: audienceSchema.shape.genders,
      })
      .optional(),
  })
);
const heatmapSchema = results(
  "heatmap",
  z.object({
    location: audienceSchema.shape.locations.element.omit({ affinity: true }),
    query: affinity,
  })
);

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

// The entity's rank velocity over the past 4 weeks; a failure leaves it out.
const velocityOf = async (qloo: QlooGet, entityId: string, type: string) => {
  const now = Date.now();
  const trend = await qloo(
    "/v2/trending",
    {
      "filter.end_date": isoDay(now),
      "filter.start_date": isoDay(now - 28 * DAY_MS),
      "filter.type": type,
      "signal.interests.entities": entityId,
    },
    trendingSchema
  ).catch((error: unknown) => {
    logErrorClass("Qloo trending skipped:", error);
  });
  return trend?.results["trending"]?.at(-1)?.population_rank_velocity;
};

// The seed's entities (names ideas must never use), the tags their fans
// share (highest affinity first) and the first entity's velocity.
export const tasteOf = async (qloo: QlooGet, seed: string) => {
  const { results: entities } = await qloo(
    "/search",
    { query: seed, take: "3" },
    searchSchema
  );
  const [first] = entities;
  if (first === undefined) {
    return { names: [], themes: [], velocity: undefined };
  }
  const type = first.types?.find((value) => value.startsWith("urn:entity:"));
  const [tags, velocity] = await Promise.all([
    qloo(
      "/v2/insights",
      {
        "filter.type": "urn:tag",
        "signal.interests.entities": entities.map((e) => e.entity_id).join(","),
        take: "10",
      },
      tagsSchema
    ),
    type === undefined ? undefined : velocityOf(qloo, first.entity_id, type),
  ]);
  const themes = (tags.results["tags"] ?? []).flatMap((tag) => {
    const id = tag.id ?? tag.tag_id ?? "";
    const score = tag.query?.affinity ?? tag.popularity ?? 0;
    return isQlooTag(id)
      ? [{ affinity: score, id, name: clip(tag.name, THEME_MAX) }]
      : [];
  });
  return {
    names: entities.map((entity) => entity.name),
    themes: themes.toSorted((a, b) => b.affinity - a.affinity),
    velocity,
  };
};

const rank = (place: {
  query?: { affinity?: number | undefined } | undefined;
}) => place.query?.affinity ?? -Infinity;

// Who loves the tags: affinity by age band and gender, and the top places.
export const audienceOf = async (
  qloo: QlooGet,
  tags: string[],
  within: string
): Promise<z.infer<typeof audienceSchema>> => {
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
  const people = demographics.results["demographics"]?.[0]?.query;
  return {
    ages: people?.age,
    genders: people?.gender,
    locations: (heatmap.results["heatmap"] ?? [])
      .toSorted((a, b) => rank(b) - rank(a))
      .slice(0, 5)
      .map(({ location, query }) => ({
        ...location,
        affinity: query?.affinity,
      })),
  };
};
