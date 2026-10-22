import { tavily } from "@tavily/core";
import { priceProduct } from "@wovain/shared/economics";
import type { Settings } from "@wovain/shared/settings";
import { THEME_MAX } from "@wovain/shared/trends";
import type {
  QlooStatus,
  ShopStatus,
  TrendIdea,
  TrendSeed,
} from "@wovain/shared/trends";

import {
  competitorOf,
  ipSafetyOf,
  mapShop,
  ownMatches,
  readListings,
  scanSite,
  SHOP_PAGES,
} from "./market.ts";
import type { Page } from "./market.ts";
import { brief, startBrief } from "./niche-brief.ts";
import { tasteOf } from "./qloo.ts";
import type { QlooGet, Taste } from "./qloo.ts";
import { marginOf, median, recencyOf, scoreIdea } from "./score.ts";
import { clip, createMeter, searchWeb, sourceOf } from "./tavily.ts";
import type { Found, Meter, TavilyApi } from "./tavily.ts";
import { logErrorClass } from "./tool-result.ts";

// Trend research on Tavily, with Qloo's taste graph when there's a key.
// Qloo says who loves the seed and what else they love (its tags are the
// themes); Tavily says why now and how crowded each theme is:
// - search, per theme: this week's news with Tavily's answer and reference
//   images, and Etsy, Redbubble and Fourthwall listings in the merchant's
//   market;
// - extract: the top listings' price, reviews and best-seller badges;
// - map: the merchant's own shop, so ideas skip what it already sells;
// - research: a cited niche brief, started here and polled by
//   get_niche_brief, so it never blocks.
// Code scores each theme (score.ts); the host agent phrases the ideas.

const THEMES = 3;
const NEWS_MAX = 5;
const MARKET_MAX = 10;
const LISTINGS = 3;
const MARKETS = ["etsy.com", "redbubble.com", "fourthwall.com"];
// Worst-case credits per step, checked against research.maxCredits. Tavily
// Research (mini) costs 4 to 110 credits, so a typical short brief is
// reserved; get_niche_brief reports what it really cost.
const COST = {
  extract: Math.ceil((THEMES * LISTINGS) / 5),
  map: SHOP_PAGES / 10,
  research: 25,
  searches: 2,
};
const KEEP_MS = 15 * 60_000;
const KEEP_MAX = 50;

interface Theme {
  affinity?: number;
  id?: string;
  name: string;
}

interface Searched {
  market: Found;
  news: Found;
  theme: Theme;
}

// Everything but the score: what a re-run with adCounts reuses.
interface Gathered {
  briefId?: string;
  names: string[];
  own: string[];
  pages: Map<string, Page>;
  qloo: QlooStatus;
  searched: Searched[];
  shop: ShopStatus;
  used: number;
  velocity?: number;
}

interface TrendsFound {
  avoidNames?: string[];
  briefId?: string;
  credits: { cap: number; used: number };
  ideas: TrendIdea[];
  qloo: QlooStatus;
  shop: ShopStatus;
}

export interface TrendResearch {
  brief: (id: string) => ReturnType<typeof brief>;
  // userId keys the cache: a shop map or brief never reaches another merchant.
  research: (
    input: TrendSeed,
    settings: Settings,
    userId: string
  ) => Promise<TrendsFound>;
  scanSite: (
    url: string
  ) => Promise<{ credits: number; pages: { excerpt: string; url: string }[] }>;
  screen: (phrase: string) => Promise<ReturnType<typeof sourceOf>[]>;
}

// Runs a step ideas don't need; a failure only leaves it out.
const optional = async <T>(
  label: string,
  run: () => Promise<T>
): Promise<T | undefined> => {
  let value: T | undefined;
  try {
    value = await run();
  } catch (error) {
    logErrorClass(`research_trends ${label} skipped:`, error);
  }
  return value;
};

const lookTaste = async (
  qloo: QlooGet | undefined,
  seed: string
): Promise<{ status: QlooStatus; taste?: Taste }> => {
  if (qloo === undefined) {
    return { status: "not_configured" };
  }
  try {
    const taste = await tasteOf(qloo, seed);
    return taste === undefined || taste.themes.length === 0
      ? { status: "no_match" }
      : { status: "used", taste };
  } catch (error) {
    logErrorClass("research_trends Qloo lookup failed:", error);
    return { status: "failed" };
  }
};

const searchTheme = async (
  client: TavilyApi,
  meter: Meter,
  { country, seed }: { country: string; seed: string },
  theme: Theme
): Promise<Searched> => {
  const query = theme.name === seed ? seed : `${theme.name} ${seed}`;
  const [news, market] = await Promise.all([
    // Timing hooks, with Tavily's answer and mood-board images. Tavily
    // applies country to general search only, so it goes on the listings.
    searchWeb(client, meter, query, {
      includeAnswer: "advanced",
      includeImageDescriptions: true,
      includeImages: true,
      maxResults: NEWS_MAX,
      timeRange: "week",
      topic: "news",
    }),
    searchWeb(client, meter, `${query} shirt`, {
      country,
      includeDomains: MARKETS,
      maxResults: MARKET_MAX,
      timeRange: "year",
      topic: "general",
    }),
  ]);
  return { market, news, theme };
};

const shopStatus = (
  shopUrl: string | undefined,
  mapped: boolean,
  own: string[] | undefined
): ShopStatus => {
  if (shopUrl === undefined) {
    return "not_set";
  }
  if (!mapped) {
    return "over_budget";
  }
  return own === undefined ? "failed" : "checked";
};

const gather = async (
  { client, qloo }: { client: TavilyApi; qloo?: QlooGet | undefined },
  seed: string,
  { research: settings }: Settings
): Promise<Gathered> => {
  const meter = createMeter();
  const { status, taste } = await lookTaste(qloo, seed);
  const themes: Theme[] = taste?.themes.slice(0, THEMES) ?? [{ name: seed }];
  // The searches always run; the rest runs in priority order while it fits.
  let left = settings.maxCredits - themes.length * COST.searches;
  const fits = (cost: number) => {
    const fit = left >= cost;
    left -= fit ? cost : 0;
    return fit;
  };
  const doBrief = fits(COST.research);
  const doExtract = fits(COST.extract);
  const { market: country, shopUrl } = settings;
  const doMap = shopUrl !== undefined && fits(COST.map);
  const [briefId, own, searched] = await Promise.all([
    doBrief
      ? optional(
          "brief",
          async () =>
            await startBrief(
              client,
              seed,
              themes.map((theme) => theme.name)
            )
        )
      : undefined,
    doMap
      ? optional("shop map", async () => await mapShop(client, meter, shopUrl))
      : undefined,
    Promise.all(
      themes.map(
        async (theme) =>
          await searchTheme(client, meter, { country, seed }, theme)
      )
    ),
  ]);
  const listings = searched.flatMap(({ market }) =>
    market.results.slice(0, LISTINGS).map((hit) => hit.url)
  );
  const pages = doExtract
    ? await optional(
        "listings",
        async () => await readListings(client, meter, [...new Set(listings)])
      )
    : undefined;
  return {
    ...(briefId === undefined ? {} : { briefId }),
    names: taste?.names ?? [],
    own: own ?? [],
    pages: pages ?? new Map<string, Page>(),
    qloo: status,
    searched,
    shop: shopStatus(shopUrl, doMap, own),
    used: meter.used,
    ...(taste?.velocity === undefined ? {} : { velocity: taste.velocity }),
  };
};

const mean = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const ideaOf = (
  gathered: Gathered,
  { market, news, theme }: Searched,
  { activeAds, priceFloor }: { activeAds?: number; priceFloor: number }
): Omit<TrendIdea, "rank"> | undefined => {
  const sources = (news.results.length > 0 ? news : market).results;
  if (sources.length === 0) {
    return undefined;
  }
  const top = market.results.slice(0, LISTINGS);
  const pages = top.map((hit) => gathered.pages.get(hit.url));
  const competitors = top.map((hit, index) => competitorOf(hit, pages[index]));
  const priceMedian = median(
    competitors.flatMap(({ price }) =>
      price === undefined ? [] : [Number(price.slice(1))]
    )
  );
  const own = ownMatches(theme.name, gathered.own);
  const signals = {
    ...(activeAds === undefined ? {} : { activeAds }),
    ...(theme.affinity === undefined ? {} : { affinity: theme.affinity }),
    bestSellers: competitors.filter((item) => item.bestSeller === true).length,
    ipSafety: ipSafetyOf(theme.name, gathered.names, pages),
    margin: marginOf(priceMedian, priceFloor),
    marketHits: market.results.length,
    newsHits: news.results.length,
    ownMatches: own.length,
    priceFloor,
    ...(priceMedian === undefined ? {} : { priceMedian }),
    recency: recencyOf(news.results.map((hit) => hit.publishedDate)),
    relevance: mean(
      [...news.results, ...market.results].map((hit) => hit.score)
    ),
    ...(gathered.velocity === undefined ? {} : { velocity: gathered.velocity }),
  };
  const moment = news.results[0]?.title;
  return {
    ...(news.answer === undefined ? {} : { answer: news.answer }),
    competitors,
    ...(moment === undefined ? {} : { moment }),
    ...(own.length > 0 ? { ownProducts: own.slice(0, 5) } : {}),
    references: news.images.slice(0, 4),
    score: scoreIdea(signals),
    signals,
    sources: sources.slice(0, 3).map(sourceOf),
    ...(theme.id === undefined ? {} : { tags: [theme.id] }),
    ...(theme.affinity === undefined
      ? {}
      : {
          taste: `${theme.name}: Qloo affinity ${theme.affinity.toFixed(2)} with this audience`,
        }),
    theme: clip(theme.name, THEME_MAX),
  };
};

const scored = (
  gathered: Gathered,
  { adCounts = [], count = THEMES }: TrendSeed,
  settings: Settings
): TrendsFound => {
  const ads = new Map(
    adCounts.map(({ activeAds, theme }) => [theme.toLowerCase(), activeAds])
  );
  const { price: priceFloor } = priceProduct(
    [{ baseCost: settings.research.baseCost, size: "M" }],
    settings.pricing,
    settings.economics
  );
  const ideas = gathered.searched
    .flatMap((searched) => {
      const activeAds = ads.get(searched.theme.name.toLowerCase());
      const idea = ideaOf(gathered, searched, {
        ...(activeAds === undefined ? {} : { activeAds }),
        priceFloor,
      });
      return idea === undefined ? [] : [idea];
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, count)
    .map((idea, index) => ({ ...idea, rank: index + 1 }));
  return {
    ...(gathered.names.length > 0
      ? { avoidNames: gathered.names.slice(0, 3) }
      : {}),
    ...(gathered.briefId === undefined ? {} : { briefId: gathered.briefId }),
    credits: { cap: settings.research.maxCredits, used: gathered.used },
    ideas,
    qloo: gathered.qloo,
    shop: gathered.shop,
  };
};

export const createTrendResearch = (
  client: TavilyApi,
  qloo?: QlooGet
): TrendResearch => {
  // A merchant's research is kept for 15 minutes, so the agent's re-run with
  // adCounts (after its Ad Library search) only re-scores: no new credits.
  // It holds their shop map and brief, so the key is the merchant plus every
  // setting that shapes the result.
  const recent = new Map<string, { at: number; gathered: Gathered }>();
  const gatherOnce = async (
    seed: string,
    settings: Settings,
    userId: string
  ) => {
    const { market, maxCredits, shopUrl } = settings.research;
    const key = JSON.stringify([
      userId,
      seed.toLowerCase(),
      market,
      maxCredits,
      shopUrl ?? "",
    ]);
    const kept = recent.get(key);
    if (kept !== undefined && Date.now() - kept.at < KEEP_MS) {
      return { ...kept.gathered, used: 0 };
    }
    const gathered = await gather({ client, qloo }, seed, settings);
    recent.delete(key);
    recent.set(key, { at: Date.now(), gathered });
    const [oldest] = recent.keys();
    if (recent.size > KEEP_MAX && oldest !== undefined) {
      recent.delete(oldest);
    }
    return gathered;
  };
  return {
    brief: async (id) => await brief(client, id),
    research: async (input, settings, userId) =>
      scored(await gatherOnce(input.seed, settings, userId), input, settings),
    scanSite: async (url) => await scanSite(client, url),
    screen: async (phrase) => {
      const { results } = await searchWeb(
        client,
        createMeter(),
        `"${phrase.replaceAll('"', "")}" trademark`,
        { exactMatch: true, maxResults: 5, topic: "general" }
      );
      return results.map(sourceOf);
    },
  };
};

// Trend research, or undefined without a Tavily key: the SDK would
// otherwise read process.env.TAVILY_API_KEY itself, then fall back to a
// keyless mode.
export const trendResearchFor = (
  apiKey?: string,
  qloo?: QlooGet
): TrendResearch | undefined =>
  apiKey === undefined
    ? undefined
    : createTrendResearch(tavily({ apiKey }), qloo);
