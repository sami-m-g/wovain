import { tavily } from "@tavily/core";
import type { TavilyClient, TavilySearchOptions } from "@tavily/core";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";
import { DEFAULT_BASE_COST, priceFor } from "./pricing";
import type { Qloo, QlooTheme, Taste } from "./qloo";
import {
  ipSafetyOf,
  marginOf,
  mean,
  median,
  recencyOf,
  scoreIdea,
} from "./score";
import type { IdeaSignals } from "./score";

// Trend research: Qloo's taste graph names the themes the seed's fans love,
// and Tavily (called live on every run) says why each one matters this week
// and how crowded it already is on the marketplaces. Code scores each theme;
// everything Tavily returns is untrusted web text, kept as data only.

const THEMES = 3;
const TIMEOUT_S = 20;
const TEXT_MAX = 1200;
const PRICE = /\$(?<amount>\d{1,4}(?:\.\d{2})?)/u;
const MARKETPLACES = ["etsy.com", "redbubble.com", "fourthwall.com"];

export type TavilySearch = Pick<TavilyClient, "search">;

export interface Source {
  publishedDate?: string | undefined;
  title: string;
  url: string;
}

export interface TrendIdea {
  // Tavily's one-paragraph answer to "why now".
  answer?: string | undefined;
  // This week's headline that makes the theme timely.
  moment?: string | undefined;
  // Qloo tag ID, when the theme came from Qloo.
  qlooTag?: string | undefined;
  rank: number;
  // Mood-board images for the art brief: never to copy.
  references: string[];
  score: number;
  signals: IdeaSignals;
  sources: Source[];
  theme: string;
}

export interface TrendResearch {
  // Names Qloo matched: never put them on a product.
  avoidNames: string[];
  ideas: TrendIdea[];
  qloo: "used" | "no_match" | "failed";
}

const qlooStatus = (taste: Taste & { failed?: boolean }) => {
  if (taste.failed === true) {
    return "failed";
  }
  return taste.themes.length > 0 ? "used" : "no_match";
};

const isWebUrl = (value: string) =>
  URL.canParse(value) && /^https?:$/u.test(new URL(value).protocol);

const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const search = async (
  client: TavilySearch,
  query: string,
  options: TavilySearchOptions,
  log?: Logger
) =>
  await external(log, { operation: "search", provider: "tavily" }, async () => {
    const reply = await client.search(query, {
      ...options,
      searchDepth: "basic",
      timeout: TIMEOUT_S,
    });
    return {
      answer:
        typeof reply.answer === "string" && reply.answer !== ""
          ? clip(reply.answer, TEXT_MAX)
          : undefined,
      images: reply.images.flatMap(({ url }) => (isWebUrl(url) ? [url] : [])),
      results: reply.results.filter((result) => isWebUrl(result.url)),
    };
  });

const searchTheme = async (
  client: TavilySearch,
  seed: string,
  theme: string,
  log?: Logger
) => {
  const query = theme === seed ? seed : `${theme} ${seed}`;
  const [news, market] = await Promise.all([
    search(
      client,
      query,
      {
        includeAnswer: "advanced",
        includeImages: true,
        maxResults: 5,
        timeRange: "week",
        topic: "news",
      },
      log
    ),
    search(
      client,
      `${query} shirt`,
      {
        includeDomains: MARKETPLACES,
        maxResults: 10,
        timeRange: "year",
        topic: "general",
      },
      log
    ),
  ]);
  return { market, news };
};

type Searched = Awaited<ReturnType<typeof searchTheme>>;

const ideaOf = (
  theme: { affinity?: number; id?: string; name: string },
  { market, news }: Searched,
  avoidNames: string[]
): Omit<TrendIdea, "rank"> | undefined => {
  const sources = news.results.length > 0 ? news.results : market.results;
  if (sources.length === 0) {
    return undefined;
  }
  const prices = market.results.flatMap((hit) => {
    const amount = PRICE.exec(hit.content)?.groups?.["amount"];
    return amount === undefined ? [] : [Number(amount)];
  });
  const signals: IdeaSignals = {
    affinity: theme.affinity,
    ipSafety: ipSafetyOf(theme.name, avoidNames),
    margin: marginOf(median(prices), priceFor(DEFAULT_BASE_COST)),
    marketHits: market.results.length,
    newsHits: news.results.length,
    recency: recencyOf(news.results.map((hit) => hit.publishedDate)),
    relevance: mean(
      [...news.results, ...market.results].map((hit) => hit.score)
    ),
  };
  return {
    answer: news.answer,
    moment: news.results[0]?.title,
    qlooTag: theme.id,
    references: news.images.slice(0, 4),
    score: scoreIdea(signals),
    signals,
    sources: sources.slice(0, 3).map(({ publishedDate, title, url }) => ({
      publishedDate,
      title: clip(title, 300),
      url,
    })),
    theme: theme.name,
  };
};

export const createTrends = (client: TavilySearch, qloo: Qloo) => ({
  research: async (seed: string, log?: Logger): Promise<TrendResearch> => {
    // Qloo only sharpens the themes: without it the seed is the one theme.
    const taste = await qloo
      .tasteOf(seed, log)
      .catch(() => ({ failed: true, names: [], themes: [] }));
    const themes: (QlooTheme | { name: string })[] =
      taste.themes.length > 0
        ? taste.themes.slice(0, THEMES)
        : [{ name: seed }];
    const searched = await Promise.all(
      themes.map(
        async (theme) => await searchTheme(client, seed, theme.name, log)
      )
    );
    // Names Qloo matched never go on a product, but the merchant's own seed
    // doesn't count against itself ("Pickleball" is also a game title).
    const avoidNames = [...new Set(taste.names)];
    const protectedNames = avoidNames.filter(
      (name) => name.toLowerCase() !== seed.toLowerCase()
    );
    const ideas = themes
      .flatMap((theme, index) => {
        const found = searched[index];
        const idea =
          found === undefined
            ? undefined
            : ideaOf(theme, found, protectedNames);
        return idea === undefined ? [] : [idea];
      })
      .toSorted((a, b) => b.score - a.score)
      .map((idea, index) => ({ ...idea, rank: index + 1 }));
    return {
      avoidNames: avoidNames.slice(0, 3),
      ideas,
      qloo: qlooStatus(taste),
    };
  },
});

export type Trends = ReturnType<typeof createTrends>;

// The official Tavily SDK; without a key it would fall back to reading
// process.env itself, so a missing key fails loudly instead.
export const tavilyClient = (apiKey: string | undefined): TavilySearch =>
  apiKey === undefined
    ? {
        search: () => {
          throw notConfigured.tavily();
        },
      }
    : tavily({ apiKey });
