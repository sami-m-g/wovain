import { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// Qloo's Taste API on the hackathon server. Qloo ships no client SDK, so this
// is plain fetch with the X-Api-Key header. Only the seed and Qloo IDs go to
// Qloo, and its answers are untrusted: every field past the IDs is optional,
// so a different shape means fewer signals rather than an error.

export interface QlooConfig {
  apiKey: string | undefined;
  baseURL: string;
}

const TIMEOUT_MS = 15_000;
const THEME_MAX = 120;

const searchSchema = z.object({
  results: z.array(
    z.object({
      entity_id: z.string().max(128),
      name: z.string().max(300),
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

const QLOO_TAG = /^urn:tag:[\w.:-]+$/u;

export interface QlooTheme {
  affinity: number;
  id: string;
  name: string;
}

export interface Taste {
  // Brands, artists and titles Qloo matched: ideas must never print them.
  names: string[];
  // Tags the seed's fans share, highest affinity first.
  themes: QlooTheme[];
}

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

  // The seed's entities and the tags their fans share.
  const tasteOf = async (seed: string, log?: Logger): Promise<Taste> =>
    await external(log, { operation: "taste", provider: "qloo" }, async () => {
      const { results: entities } = await get(
        "/search",
        { query: seed, take: "3" },
        searchSchema
      );
      if (entities.length === 0) {
        return { names: [], themes: [] };
      }
      const tags = await get(
        "/v2/insights",
        {
          "filter.type": "urn:tag",
          "signal.interests.entities": entities
            .map((entity) => entity.entity_id)
            .join(","),
          take: "10",
        },
        tagsSchema
      );
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
      const distinct = themes
        .toSorted((a, b) => b.affinity - a.affinity)
        .filter(({ name }) => {
          const key = name.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");
          const fresh = key !== "" && !seen.has(key);
          seen.add(key);
          return fresh;
        });
      return {
        names: entities.map((entity) => entity.name),
        themes: distinct,
      };
    });

  return { tasteOf };
};

export type Qloo = ReturnType<typeof createQloo>;
