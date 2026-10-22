import { tavily } from "@tavily/core";
import { isWebUrl, SOURCE_TITLE_MAX } from "@wovain/shared/trends";

// Tavily web search through its official SDK. Each search here is basic
// depth: 1 Tavily credit. Everything it returns is untrusted web text.

export interface SearchHit {
  content: string;
  publishedDate?: string;
  title: string;
  url: string;
}

interface SearchOptions {
  exactMatch?: boolean;
  maxResults: number;
  topic?: "general" | "news";
  timeRange?: "week";
}

export type Search = (
  query: string,
  options: SearchOptions
) => Promise<SearchHit[]>;

// Seconds; the SDK's default is 60.
const TIMEOUT_S = 20;
// A snippet is all the ranking reads.
const SNIPPET_MAX = 300;

export const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

// Tags and runs of whitespace out, so a title is one line of plain text.
const plain = (value: string) =>
  value
    .replaceAll(/<[^>]*>/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();

// Keeps http and https results only, with titles as clipped plain text and
// snippets clipped.
export const toHits = (results: SearchHit[]): SearchHit[] =>
  results.flatMap(({ content, publishedDate, title, url }) =>
    isWebUrl(url)
      ? [
          {
            content: clip(content, SNIPPET_MAX),
            title: clip(plain(title), SOURCE_TITLE_MAX),
            url,
            // Tavily leaves the date empty for some general results.
            ...(publishedDate === undefined || publishedDate === ""
              ? {}
              : { publishedDate }),
          },
        ]
      : []
  );

// Without a key there is no client: the SDK would otherwise read
// process.env.TAVILY_API_KEY itself, then fall back to a keyless mode.
export const createSearch = (apiKey?: string): Search | undefined => {
  if (apiKey === undefined) {
    return undefined;
  }
  const client = tavily({ apiKey });
  return async (query, options) => {
    const { results } = await client.search(query, {
      ...options,
      searchDepth: "basic",
      timeout: TIMEOUT_S,
    });
    return toHits(results);
  };
};
