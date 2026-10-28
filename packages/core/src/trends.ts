import { tavily } from "@tavily/core";
import type {
  TavilyClient,
  TavilySearchOptions,
  TavilySearchResponse,
} from "@tavily/core";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";
import type { Nemotron } from "./nemotron";
import { priceFor, pricingRules } from "./pricing";
import type {
  AffinityType,
  Qloo,
  QlooAffinity,
  QlooEntity,
  QlooTheme,
  Taste,
} from "./qloo";
import {
  ipSafetyOf,
  marginOf,
  mean,
  median,
  recencyOf,
  scoreIdea,
} from "./score";
import type { IdeaSignals } from "./score";
import { themesFor } from "./themes";
import type { Theme } from "./themes";

// Trend research: Qloo's taste graph names the themes the seed's fans love
// (topped up from the brief by Nemotron, ./themes), and Tavily (called live
// on every run) says why each one matters now and how crowded it already is
// on the marketplaces. Code filters and ranks the sources and scores each
// theme; everything Tavily returns is untrusted web text, kept as data only.

const TIMEOUT_S = 20;
const TEXT_MAX = 1200;
const PRICE = /\$(?<amount>\d{1,4}(?:\.\d{2})?)/u;
const MARKETPLACES = ["etsy.com", "redbubble.com", "fourthwall.com"];
// Sources an idea shows, after filtering and ranking.
const SOURCES_SHOWN = 3;
// Tavily's relevance score (0..1) a news result needs to count as evidence.
export const MIN_RELEVANCE = 0.4;
// News older than this is not "why now", whatever the search returned.
export const MAX_NEWS_AGE_DAYS = 31;
const DAY_MS = 86_400_000;
const YEAR_DAYS = 365;
// Archive, tag and listing pages match a query's words without being about
// it ("Archive for March 2011 – SlashFilm").
const INDEX_PATH =
  /\/(?:archives?|authors?|categor(?:y|ies)|page|search|tags?|topics?)(?:\/|$)|\/\d{4}\/\d{2}\/?$/iu;
const INDEX_TITLE = /^(?:archives?|all posts|category|tag)\b|\barchives?\b/iu;
const WORD = /[\p{L}\p{N}]{3,}/gu;

export type TavilySearch = Pick<TavilyClient, "search">;
type Hit = TavilySearchResponse["results"][number];

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
  // Why this idea: what Qloo's taste graph said (the qloo-taste-map flag).
  taste?: TasteMap | undefined;
  theme: string;
}

// off: the trends-qloo flag said no, or the merchant ran without Qloo.
export type QlooStatus = "used" | "no_match" | "failed" | "off";

// What Qloo contributed to one idea: the entities it matched for the seed,
// the theme's Qloo tag when the theme came from Qloo, and what the seed's
// fans also like in other domains, with each seed entity's share.
export interface TasteMap {
  affinities: QlooAffinity[];
  // Domains Qloo couldn't load affinities from (logged at error level).
  // Ideas saved before this field have none.
  failedDomains?: AffinityType[] | undefined;
  seeds: QlooEntity[];
  status: QlooStatus;
  tag?: QlooTheme | undefined;
}

export interface TrendResearch {
  // Names Qloo matched: never put them on a product.
  avoidNames: string[];
  ideas: TrendIdea[];
  qloo: QlooStatus;
}

// Which sources a run may use: the trends-qloo and trends-tavily flags,
// evaluated by the caller for the merchant (packages/api/src/flow/ideas.ts),
// and the merchant's own choice to run without Qloo. tasteMap asks Qloo for
// cross-domain affinities and saves the taste map on each idea.
export interface TrendSources {
  qloo: boolean;
  tasteMap?: boolean | undefined;
  tavily: boolean;
}

const ALL_SOURCES: TrendSources = { qloo: true, tavily: true };
const NO_TASTE: Taste & { failed?: boolean } = { names: [], themes: [] };

const tasteMapOf = (
  theme: Theme,
  taste: Taste,
  status: QlooStatus
): TasteMap => ({
  affinities: taste.affinities ?? [],
  failedDomains: taste.failedDomains ?? [],
  seeds: taste.seeds ?? [],
  status,
  ...(theme.id !== undefined && {
    tag: { affinity: theme.affinity ?? 0, id: theme.id, name: theme.name },
  }),
});

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

// One key per page: scheme, www, query, hash and a trailing slash aside.
const pageKey = (url: string) => {
  const { hostname, pathname } = new URL(url);
  const host = hostname.replace(/^www\./u, "");
  return `${host}${pathname.replace(/\/+$/u, "")}`.toLowerCase();
};

const titleKey = (title: string) =>
  title
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const wordsOf = (value: string) =>
  new Set([...value.toLowerCase().matchAll(WORD)].map(([word]) => word));

const ageDays = (date: string | undefined, now: number) => {
  const time = date === undefined ? Number.NaN : Date.parse(date);
  return Number.isNaN(time) ? undefined : (now - time) / DAY_MS;
};

const isIndexPage = ({ title, url }: Hit) =>
  INDEX_PATH.test(new URL(url).pathname) || INDEX_TITLE.test(title);

export interface SourceFilter {
  // Drop dated results older than this many days.
  maxAgeDays?: number | undefined;
  // Drop results Tavily scored less relevant than this.
  minScore: number;
}

// Evidence a theme can stand on: web pages about the theme (they share a
// word with its query and Tavily scores them relevant), recent, not archive
// or tag pages, one per page and per headline, most relevant and freshest
// first.
export const rankSources = (
  hits: Hit[],
  query: string,
  { maxAgeDays, minScore }: SourceFilter,
  now = Date.now()
): Hit[] => {
  const words = wordsOf(query);
  const window = maxAgeDays ?? YEAR_DAYS;
  const weight = (hit: Hit) => {
    const age = ageDays(hit.publishedDate, now);
    const fresh = age === undefined ? 0 : Math.max(0, 1 - age / window);
    return hit.score * (1 + fresh);
  };
  const relevant = (hit: Hit) => {
    if (!isWebUrl(hit.url) || isIndexPage(hit) || hit.score < minScore) {
      return false;
    }
    const age = ageDays(hit.publishedDate, now);
    if (maxAgeDays !== undefined && age !== undefined && age > maxAgeDays) {
      return false;
    }
    const text = wordsOf(`${hit.title} ${hit.content}`);
    return words.size === 0 || [...words].some((word) => text.has(word));
  };
  const pages = new Set<string>();
  const titles = new Set<string>();
  return hits
    .filter(relevant)
    .toSorted((a, b) => weight(b) - weight(a))
    .filter((hit) => {
      const page = pageKey(hit.url);
      const title = titleKey(hit.title);
      const repeat = pages.has(page) || (title !== "" && titles.has(title));
      pages.add(page);
      titles.add(title);
      return !repeat;
    });
};

const search = async (
  client: TavilySearch,
  query: string,
  options: TavilySearchOptions,
  log?: Logger
) =>
  await external(log, { operation: "search", provider: "tavily" }, async () => {
    const reply = await client.search(query, {
      searchDepth: "basic",
      timeout: TIMEOUT_S,
      ...options,
    });
    return {
      answer:
        typeof reply.answer === "string" && reply.answer !== ""
          ? clip(reply.answer, TEXT_MAX)
          : undefined,
      images: reply.images.flatMap(({ url }) => (isWebUrl(url) ? [url] : [])),
      results: reply.results,
    };
  });

// The news search reads Tavily's reranked "advanced" snippets from the past
// month; the marketplace search only counts and prices listings.
const searchTheme = async (
  client: TavilySearch,
  theme: Theme,
  log?: Logger
) => {
  const [news, market] = await Promise.all([
    search(
      client,
      theme.query,
      {
        includeAnswer: "advanced",
        includeImages: true,
        maxResults: 10,
        searchDepth: "advanced",
        timeRange: "month",
        topic: "news",
      },
      log
    ),
    search(
      client,
      `${theme.query} t-shirt`,
      {
        includeDomains: MARKETPLACES,
        maxResults: 10,
        timeRange: "year",
        topic: "general",
      },
      log
    ),
  ]);
  return {
    market: {
      ...market,
      results: rankSources(market.results, theme.query, { minScore: 0 }),
    },
    news: {
      ...news,
      results: rankSources(news.results, theme.query, {
        maxAgeDays: MAX_NEWS_AGE_DAYS,
        minScore: MIN_RELEVANCE,
      }),
    },
  };
};

type Searched = Awaited<ReturnType<typeof searchTheme>>;

const ideaOf = (
  theme: Theme,
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
    margin: marginOf(median(prices), priceFor(pricingRules().defaultBaseCost)),
    marketHits: market.results.length,
    newsHits: news.results.length,
    recency: recencyOf(news.results.map((hit) => hit.publishedDate)),
    relevance: mean(
      [...news.results, ...market.results].map((hit) => hit.score)
    ),
  };
  return {
    // Tavily's answer stands only when its news held up.
    answer: news.results.length > 0 ? news.answer : undefined,
    moment: news.results[0]?.title,
    qlooTag: theme.id,
    references: news.images.slice(0, 4),
    score: scoreIdea(signals),
    signals,
    sources: sources
      .slice(0, SOURCES_SHOWN)
      .map(({ publishedDate, title, url }) => ({
        publishedDate,
        title: clip(title, 300),
        url,
      })),
    theme: theme.name,
  };
};

export const createTrends = (
  client: TavilySearch,
  qloo: Pick<Qloo, "tasteOf">,
  // Splits a brief into themes when Qloo names too few; without it, design
  // angles on the brief's subject stand in (./themes).
  ask?: Nemotron
) => ({
  research: async (
    seed: string,
    log?: Logger,
    sources: TrendSources = ALL_SOURCES
  ): Promise<TrendResearch> => {
    // Tavily is the evidence: without it there is nothing to rank.
    if (!sources.tavily) {
      return {
        avoidNames: [],
        ideas: [],
        qloo: sources.qloo ? "no_match" : "off",
      };
    }
    // Qloo sharpens the themes; the brief tops them up to MIN_THEMES.
    const tasteOf = async () =>
      sources.tasteMap === true
        ? await qloo.tasteOf(seed, log, { crossDomain: true })
        : await qloo.tasteOf(seed, log);
    const taste = sources.qloo
      ? await tasteOf().catch((error: unknown) => {
          // Research goes on without Qloo, but the failure still reaches
          // the error sink (PostHog Error Tracking).
          log?.error?.(
            error instanceof Error ? error : new Error(String(error))
          );
          return { failed: true, names: [], themes: [] };
        })
      : NO_TASTE;
    const themes = await themesFor(seed, taste.themes, ask, log);
    const searched = await Promise.all(
      themes.map(async (theme) => await searchTheme(client, theme, log))
    );
    // Names Qloo matched never go on a product, but the merchant's own seed
    // doesn't count against itself ("Pickleball" is also a game title).
    const avoidNames = [...new Set(taste.names)];
    const protectedNames = avoidNames.filter(
      (name) => name.toLowerCase() !== seed.toLowerCase()
    );
    const status = sources.qloo ? qlooStatus(taste) : "off";
    const ideas = themes
      .flatMap((theme, index) => {
        const found = searched[index];
        const idea =
          found === undefined
            ? undefined
            : ideaOf(theme, found, protectedNames);
        if (idea === undefined) {
          return [];
        }
        return sources.tasteMap === true
          ? [{ ...idea, taste: tasteMapOf(theme, taste, status) }]
          : [idea];
      })
      .toSorted((a, b) => b.score - a.score)
      .map((idea, index) => ({ ...idea, rank: index + 1 }));
    return {
      avoidNames: avoidNames.slice(0, 3),
      ideas,
      qloo: status,
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
