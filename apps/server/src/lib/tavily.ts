import { tavily } from "@tavily/core";

// Tavily web search through its official SDK. Each search here is basic
// depth: 1 Tavily credit.

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
    return results.map(({ content, publishedDate, title, url }) => ({
      content,
      title,
      url,
      // Tavily leaves the date empty for some general results.
      ...(publishedDate ? { publishedDate } : {}),
    }));
  };
};
