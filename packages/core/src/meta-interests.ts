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
// answers, and a match rule that keeps only interests named like the query.

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

// The interest that names what was asked, or none: an exact name first,
// then a name that contains the query (or the query it), the largest
// audience winning a tie. "Street fashion" matches "Street fashion" and
// "Fashion" matches "Fashion design" but "Golf" never matches "Fashion".
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
  return valid
    .filter((interest) => {
      const name = ` ${normal(interest.name)} `;
      return (
        name.includes(words) || (name.trim() !== "" && words.includes(name))
      );
    })
    .toSorted((a, b) => (b.audienceSize ?? 0) - (a.audienceSize ?? 0))[0];
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
