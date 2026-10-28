import { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";

// Meta's targeting search for interests (GET /search?type=adinterest), the
// only place real interest IDs come from: Meta's Ads MCP server has no
// search tool and asks callers never to invent IDs. Called with wovain's
// app access token (app ID and secret), so no merchant grant is needed.
//
// Pattern from mikusnuz/meta-ads-mcp (src/tools/targeting.ts,
// search_targeting), MIT License: https://github.com/mikusnuz/meta-ads-mcp
// Changes: TypeScript client without the MCP server, typed and checked
// answers, and a match rule that keeps only interests named like the query
// (an exact name, or a broader name from an apparel-related category).

export interface MetaInterestsConfig {
  appId: string | undefined;
  appSecret: string | undefined;
  // The Graph API base with its version, e.g. https://graph.facebook.com/v24.0
  graphUrl: string;
}

export interface MetaInterest {
  // Meta's lower bound of people the interest reaches.
  audienceSize?: number | undefined;
  id: string;
  name: string;
  // Meta's category path, e.g. ["Interests", "Shopping and fashion"].
  path: string[];
}

const TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 8;
const META_ID = /^\d{6,20}$/u;

const searchSchema = z.object({
  data: z
    .array(
      z.object({
        audience_size_lower_bound: z.number().optional(),
        id: z.union([z.string(), z.number()]).transform(String),
        name: z.string().max(300),
        path: z.array(z.string().max(200)).optional(),
      })
    )
    .default([]),
});

const normal = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Meta's interest categories a broader name may come from: an apparel brand's
// buyers, not courts, places or people that share a word with it.
const BROADER_CATEGORIES = new Set([
  "hobbies and activities",
  "shopping and fashion",
]);

const inBroaderCategory = ({ path }: MetaInterest) =>
  normal(path[0] ?? "") === "interests" &&
  BROADER_CATEGORIES.has(normal(path[1] ?? ""));

// The interest that names what was asked, or none. An exact name first;
// else, from Meta's apparel-related categories only, a name that holds the
// query as whole words, in Meta's own ranking order. "Street fashion"
// matches "Street fashion", "Fashion" matches "Fashion design" under
// Shopping and fashion, "Supreme" never matches "Supreme Court of the
// United States" and "Street fashion" never matches "Street".
export const bestMatch = (
  query: string,
  found: readonly MetaInterest[]
): MetaInterest | undefined => {
  const wanted = normal(query);
  if (wanted === "") {
    return undefined;
  }
  const valid = found.filter((interest) => META_ID.test(interest.id));
  const exact = valid.find((interest) => normal(interest.name) === wanted);
  if (exact !== undefined) {
    return exact;
  }
  // Whole words only: spaces around both sides.
  const words = ` ${wanted} `;
  return valid.find(
    (interest) =>
      inBroaderCategory(interest) &&
      ` ${normal(interest.name)} `.includes(words)
  );
};

export const createMetaInterests = ({
  appId,
  appSecret,
  graphUrl,
}: MetaInterestsConfig) => {
  const search = async (query: string, log?: Logger): Promise<MetaInterest[]> =>
    await external(
      log,
      { operation: "interest_search", provider: "meta" },
      async () => {
        if (appId === undefined || appSecret === undefined) {
          throw notConfigured.meta();
        }
        const params = new URLSearchParams({
          access_token: `${appId}|${appSecret}`,
          limit: String(SEARCH_LIMIT),
          q: query,
          type: "adinterest",
        });
        // The configured Graph base; the query is encoded, so no input
        // picks the host.
        // nosemgrep
        const response = await fetch(`${graphUrl}/search?${params}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`Meta targeting search answered ${response.status}`);
        }
        const { data } = searchSchema.parse(await response.json());
        return data.map((row) => ({
          audienceSize: row.audience_size_lower_bound,
          id: row.id,
          name: row.name.trim(),
          path: row.path ?? [],
        }));
      }
    );

  return { search };
};

export type MetaInterests = ReturnType<typeof createMetaInterests>;
