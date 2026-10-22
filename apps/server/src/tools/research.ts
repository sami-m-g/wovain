import type { McpServer } from "@modelcontextprotocol/server";
import {
  trademarkInputSchema,
  trademarkResultSchema,
  trendSeedSchema,
  trendsResultSchema,
} from "@wovain/shared/trends";

import { text } from "../lib/tool-result.ts";
import type { TrendResearch } from "../lib/trends.ts";

const NOT_SET_UP =
  "Trend research isn't set up (TAVILY_API_KEY). Ask the merchant for an idea instead.";

const TRADEMARK_NOTE =
  "Web results, not a trademark search: check any hit on USPTO (tmsearch.uspto.gov) or EUIPO before publishing. No hits doesn't mean the phrase is free.";

// Runs a Tavily-backed call, logging only the error class: the query and
// the results stay out of the logs.
const guarded = async <T>(
  tool: string,
  message: string,
  run: () => Promise<T>
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    console.error(
      `${tool} failed:`,
      error instanceof Error ? error.name : "unknown"
    );
    throw new Error(message, { cause: error });
  }
};

// research_trends and screen_trademark: Tavily search at runtime. Without a
// Tavily key, research is undefined and both tools say so.
export const registerResearchTools = (
  server: McpServer,
  research: TrendResearch | undefined
) => {
  const annotations = {
    destructiveHint: false,
    openWorldHint: true,
    readOnlyHint: true,
  };
  server.registerTool(
    "research_trends",
    {
      annotations,
      description:
        "Find 3 to 5 tee ideas from this week's news for a niche, audience or seed idea (Tavily search; ranked by NVIDIA Nemotron when wovain has a Nebius key, by recency and source count otherwise). Each idea links its sources. Use it when the merchant has no product idea yet. Returns configured: false when wovain has no Tavily key.",
      inputSchema: trendSeedSchema,
      outputSchema: trendsResultSchema,
      title: "Research trends",
    },
    async (input) => {
      if (research === undefined) {
        return {
          content: text(NOT_SET_UP),
          structuredContent: { configured: false },
        };
      }
      const { ideas, ranker } = await guarded(
        "research_trends",
        "Trend research failed; ask the merchant for an idea instead.",
        async () => await research.research(input)
      );
      return {
        content: text(JSON.stringify({ ideas, ranker })),
        structuredContent: { configured: true, ideas, ranker },
      };
    }
  );
  server.registerTool(
    "screen_trademark",
    {
      annotations,
      description:
        "Before publishing, search the web for a phrase on the design (its title's key phrase or any text in the artwork) plus 'trademark'. Returns possible hits for the merchant to check; it isn't a legal answer and never blocks. Returns configured: false when wovain has no Tavily key.",
      inputSchema: trademarkInputSchema,
      outputSchema: trademarkResultSchema,
      title: "Screen a phrase for trademarks",
    },
    async ({ phrase }) => {
      if (research === undefined) {
        return {
          content: text(
            "The trademark screen isn't set up (TAVILY_API_KEY). Skip it."
          ),
          structuredContent: { configured: false },
        };
      }
      const hits = await guarded(
        "screen_trademark",
        "The trademark screen failed; go on without it.",
        async () => await research.screen(phrase)
      );
      const result = { hits, note: TRADEMARK_NOTE, phrase };
      return {
        content: text(JSON.stringify(result)),
        structuredContent: { configured: true, ...result },
      };
    }
  );
};
