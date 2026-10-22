import type {
  TavilyClient,
  TavilySearchOptions,
  TavilySearchResponse,
} from "@tavily/core";
import { isWebUrl, SOURCE_TITLE_MAX } from "@wovain/shared/trends";

// Tavily web search through its official SDK. Each search here is basic
// depth: 1 Tavily credit. Everything it returns is untrusted web text, and
// it only ever leaves wovain as JSON data marked untrusted.

export type SearchClient = Pick<TavilyClient, "search">;
// The SDK declares TavilySearchResult without exporting it.
export type SearchResult = TavilySearchResponse["results"][number];

// Seconds; the SDK's default is 60.
const TIMEOUT_S = 20;
// A snippet is all the ranking reads.
const SNIPPET_MAX = 300;

export const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

// Keeps http and https results only, with titles and snippets clipped.
export const searchWeb = async (
  client: SearchClient,
  query: string,
  options: TavilySearchOptions
): Promise<SearchResult[]> => {
  const { results } = await client.search(query, {
    ...options,
    searchDepth: "basic",
    timeout: TIMEOUT_S,
  });
  return results.flatMap((result) =>
    isWebUrl(result.url)
      ? [
          {
            ...result,
            content: clip(result.content, SNIPPET_MAX),
            title: clip(result.title, SOURCE_TITLE_MAX),
          },
        ]
      : []
  );
};
