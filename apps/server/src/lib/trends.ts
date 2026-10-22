import { tavily } from "@tavily/core";
import { priceProduct } from "@wovain/shared/economics";
import type { Settings } from "@wovain/shared/settings";
import { isWebUrl, TEXT_MAX, THEME_MAX } from "@wovain/shared/trends";
import type { TrendSeed } from "@wovain/shared/trends";

import { tasteOf } from "./qloo.ts";
import type { QlooGet } from "./qloo.ts";
import { marginOf, mean, median, recencyOf, scoreIdea } from "./score.ts";
import { clip, searchWeb, sourceOf, textOf, TIMEOUT_S } from "./tavily.ts";
import type { SearchResult, TavilyApi } from "./tavily.ts";
import { logErrorClass } from "./tool-result.ts";

// Trend research. Qloo's taste graph (with a key) names the themes the
// seed's fans love; Tavily says why now and how crowded each one is (search),
// reads the top listings (extract), maps the merchant's shop (map), starts a
// cited niche brief (research, polled by get_niche_brief), crawls a
// competitor's site (crawl) and screens trademarks (search). Code scores
// each theme (score.ts); the agent phrases the ideas.

const THEMES = 3;
const LISTINGS = 3;
const SHOP_PAGES = 40;
// Worst-case credits per step, checked against research.maxCredits. A brief
// costs 4 to 110; get_niche_brief reports what it really cost.
const COST = { brief: 25, extract: 2, map: SHOP_PAGES / 10, search: 2 };
const KEEP_MS = 15 * 60_000;
const PRICE = /\$\d{1,4}(?:\.\d{2})?/u;
const REVIEWS = /\d[\d,.]*k?\s+(?:reviews|ratings|sales)/iu;

interface Theme {
  affinity?: number;
  id?: string;
  name: string;
}
type Paid = { usage?: { credits?: number } | undefined } | undefined;

const field = (type: string, description: string) => ({
  description,
  type,
  ...(type === "array" ? { items: { type: "string" } } : {}),
});
const BRIEF_SCHEMA = {
  properties: {
    angles: field(
      "array",
      "Up to 5 design or message angles that sell in this niche"
    ),
    audience: field(
      "string",
      "Who buys t-shirts in this niche: ages, identities, where they gather"
    ),
    priceBand: field(
      "string",
      "The usual retail price range for a tee here, in USD"
    ),
    risks: field(
      "array",
      "Up to 5 risks: trademarks, saturated designs, seasonality"
    ),
    sources: field("array", "URLs of the pages the brief relies on"),
  },
  required: ["audience", "priceBand", "angles", "risks"],
};

const creditsOf = (replies: Paid[]) =>
  Math.round(
    replies.reduce((sum, reply) => sum + (reply?.usage?.credits ?? 0), 0) * 100
  ) / 100;

// Strings only, clipped; a single string counts as a list of one.
const strings = (value: unknown, max: number, take = 5) =>
  (Array.isArray(value) ? value : [value])
    .flatMap((item) => textOf(item, max) ?? [])
    .slice(0, take);

// A step the ideas don't need, run when it has its input: a failure only
// leaves it out.
const step = async <I, T>(
  input: I | false | undefined,
  label: string,
  run: (input: I) => Promise<T>
) =>
  input === false || input === undefined
    ? undefined
    : await run(input).catch((error: unknown): undefined => {
        logErrorClass(`research_trends ${label} skipped:`, error);
      });

const tasteFor = async (qloo: QlooGet | undefined, seed: string) => {
  if (qloo === undefined) {
    return { qloo: "not_configured" as const };
  }
  const taste = await step(
    qloo,
    "Qloo",
    async (get) => await tasteOf(get, seed)
  );
  if (taste === undefined) {
    return { qloo: "failed" as const };
  }
  return taste.themes.length > 0
    ? { qloo: "used" as const, taste }
    : { qloo: "no_match" as const };
};

const searchTheme = async (
  client: TavilyApi,
  { market: country }: Settings["research"],
  seed: string,
  theme: Theme
) => {
  const query = theme.name === seed ? seed : `${theme.name} ${seed}`;
  const [news, market] = await Promise.all([
    searchWeb(client, query, {
      includeAnswer: "advanced",
      includeImageDescriptions: true,
      includeImages: true,
      maxResults: 5,
      timeRange: "week",
      topic: "news",
    }),
    // Tavily applies country to general search only.
    searchWeb(client, `${query} shirt`, {
      country,
      includeDomains: ["etsy.com", "redbubble.com", "fourthwall.com"],
      maxResults: 10,
      timeRange: "year",
      topic: "general",
    }),
  ]);
  return { market, news, theme };
};

const startBrief = async (client: TavilyApi, seed: string, themes: Theme[]) => {
  const names = themes.map((theme) => theme.name).join(", ");
  const started = await client.research(
    `A print-on-demand t-shirt niche brief for fans of "${seed}" (themes: ${names}): who buys, the usual price band, design angles that sell, and risks such as trademarks and saturation. Cite sources.`,
    {
      citationFormat: "numbered",
      model: "mini",
      outputSchema: BRIEF_SCHEMA,
      // Not in the SDK's options: sent as-is.
      output_length: "short",
      timeout: TIMEOUT_S,
    }
  );
  return "requestId" in started ? started.requestId : undefined;
};

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((w) => w.length > 3)
  );

// 0 when the theme names a brand, artist or title Qloo matched; 0.5 when a
// top listing says it's officially licensed.
const ipSafetyOf = (theme: string, names: string[], pages: string[]) => {
  const lowered = theme.toLowerCase();
  if (
    names.some(
      (name) => name.length > 2 && lowered.includes(name.toLowerCase())
    )
  ) {
    return 0;
  }
  return pages.some((page) => /officially licensed/iu.test(page)) ? 0.5 : 1;
};

// A listing's price, reviews and badge, from its extract (reranked by the
// extract's query).
const competitorOf = (hit: SearchResult, page = "") => ({
  ...sourceOf(hit),
  bestSeller: /best[\s-]?seller/iu.test(page) || undefined,
  price: PRICE.exec(page)?.[0],
  reviews: textOf(REVIEWS.exec(page)?.[0], 32),
});

const shopStatus = (url: string | undefined, mapped: boolean, map: Paid) => {
  if (url === undefined) {
    return "not_set" as const;
  }
  if (!mapped) {
    return "over_budget" as const;
  }
  return map === undefined ? ("failed" as const) : ("checked" as const);
};

const gather = async (
  client: TavilyApi,
  qloo: QlooGet | undefined,
  seed: string,
  settings: Settings["research"]
) => {
  const { map: mapSite } = client;
  const { qloo: qlooStatus, taste } = await tasteFor(qloo, seed);
  const themes: Theme[] = taste?.themes.slice(0, THEMES) ?? [{ name: seed }];
  // The searches always run; the rest runs in priority order while it fits.
  let left = settings.maxCredits - themes.length * COST.search;
  const fits = (cost: number) => {
    const fit = left >= cost;
    left -= fit ? cost : 0;
    return fit;
  };
  const doBrief = fits(COST.brief);
  const doExtract = fits(COST.extract);
  const { shopUrl } = settings;
  const doMap = shopUrl !== undefined && fits(COST.map);
  const [briefId, map, searched] = await Promise.all([
    step(doBrief, "brief", async () => await startBrief(client, seed, themes)),
    step(
      doMap && shopUrl,
      "shop map",
      async (site) =>
        await mapSite(site, {
          includeUsage: true,
          limit: SHOP_PAGES,
          maxDepth: 2,
          selectPaths: ["/products/.+"],
          timeout: TIMEOUT_S,
        })
    ),
    Promise.all(
      themes.map(
        async (theme) => await searchTheme(client, settings, seed, theme)
      )
    ),
  ]);
  const listings = [
    ...new Set(
      searched.flatMap(({ market }) =>
        market.results.slice(0, LISTINGS).map((hit) => hit.url)
      )
    ),
  ];
  const extract = await step(
    doExtract && listings.length > 0 && listings,
    "listings",
    async (urls) =>
      await client.extract(urls, {
        chunksPerSource: 3,
        extractDepth: "basic",
        includeUsage: true,
        query: "price, number of reviews or sales, best seller badge",
        timeout: TIMEOUT_S,
      })
  );
  const names = taste?.names ?? [];
  const own = map?.results.filter((url) => isWebUrl(url)) ?? [];
  const pages = new Map(
    extract?.results.map((page) => [page.url, page.rawContent])
  );
  // Each theme's idea with every signal that doesn't depend on adCounts or
  // settings.
  const draft = ({ market, news, theme }: (typeof searched)[number]) => {
    const sources = (news.results.length > 0 ? news : market).results;
    if (sources.length === 0) {
      return [];
    }
    const top = market.results.slice(0, LISTINGS);
    const texts = top.map((hit) => pages.get(hit.url) ?? "");
    const competitors = top.map((hit, index) =>
      competitorOf(hit, texts[index])
    );
    const wanted = words(theme.name);
    const mine = own.filter((url) =>
      [...words(new URL(url).pathname)].some((word) => wanted.has(word))
    );
    const prices = competitors.flatMap(({ price }) =>
      price === undefined ? [] : [Number(price.slice(1))]
    );
    const idea = {
      answer: news.answer,
      competitors,
      moment: news.results[0]?.title,
      ownProducts: mine.length > 0 ? mine.slice(0, 5) : undefined,
      references: news.images.slice(0, 4),
      signals: {
        affinity: theme.affinity,
        bestSellers: competitors.filter((item) => item.bestSeller).length,
        ipSafety: ipSafetyOf(theme.name, names, texts),
        marketHits: market.results.length,
        newsHits: news.results.length,
        ownMatches: mine.length,
        priceMedian: median(prices),
        recency: recencyOf(news.results.map((hit) => hit.publishedDate)),
        relevance: mean(
          [...news.results, ...market.results].map((hit) => hit.score)
        ),
        velocity: taste?.velocity,
      },
      sources: sources.slice(0, 3).map(sourceOf),
      tags: theme.id === undefined ? undefined : [theme.id],
      taste:
        theme.affinity === undefined
          ? undefined
          : `${theme.name}: Qloo affinity ${theme.affinity.toFixed(2)} with this audience`,
      theme: clip(theme.name, THEME_MAX),
    };
    return [idea];
  };
  const replies = searched.flatMap(({ market, news }) => [market, news]);
  return {
    avoidNames: names.length > 0 ? names.slice(0, 3) : undefined,
    briefId,
    credits: {
      cap: settings.maxCredits,
      used: creditsOf([...replies, map, extract]),
    },
    ideas: searched.flatMap(draft),
    qloo: qlooStatus,
    shop: shopStatus(shopUrl, doMap, map),
  };
};
type Gathered = Awaited<ReturnType<typeof gather>>;

const scored = (
  gathered: Gathered,
  { adCounts = [], count = THEMES }: TrendSeed,
  { economics, pricing, research }: Settings
) => {
  const ads = new Map(
    adCounts.map(({ activeAds, theme }) => [theme.toLowerCase(), activeAds])
  );
  const { price: priceFloor } = priceProduct(
    [{ baseCost: research.baseCost, size: "M" }],
    pricing,
    economics
  );
  const ideas = gathered.ideas
    .map(({ signals: drafted, ...idea }) => {
      const signals = {
        ...drafted,
        activeAds: ads.get(idea.theme.toLowerCase()),
        margin: marginOf(drafted.priceMedian, priceFloor),
        priceFloor,
      };
      return { ...idea, score: scoreIdea(signals), signals };
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, count)
    .map((idea, index) => ({ ...idea, rank: index + 1 }));
  return { ...gathered, ideas };
};

const pollBrief = async (client: TavilyApi, id: string) => {
  const reply = await client.getResearch(id, { includeUsage: true });
  if (!("content" in reply) || reply.status !== "completed") {
    const status = (["failed", "in_progress"] as const).find(
      (value) => value === reply.status
    );
    return { status: status ?? ("pending" as const) };
  }
  const fields =
    typeof reply.content === "string"
      ? { audience: reply.content }
      : reply.content;
  // Tavily's own sources come last, so their titles win.
  const cited: { title?: string; url: string }[] = [
    ...strings(fields["sources"], 4096, 10).map((url) => ({ url })),
    ...reply.sources,
  ];
  const sources = new Map(
    cited.flatMap(({ title, url }) =>
      isWebUrl(url) ? [[url, { title: textOf(title, 300), url }] as const] : []
    )
  );
  return {
    brief: {
      angles: strings(fields["angles"], 300),
      audience: strings(fields["audience"], TEXT_MAX)[0],
      priceBand: strings(fields["priceBand"], 200)[0],
      risks: strings(fields["risks"], 300),
    },
    credits: creditsOf([reply]),
    sources: [...sources.values()].slice(0, 10),
    status: "completed" as const,
  };
};

export const createTrendResearch = (client: TavilyApi, qloo?: QlooGet) => {
  // Each merchant's research is kept 15 minutes (50 at most), so the agent's
  // re-run with adCounts only re-scores, for no credits. It holds their shop
  // map and brief, so the key is the merchant plus the research settings.
  const kept = new Map<string, { at: number; gathered: Gathered }>();
  const gatherOnce = async (
    seed: string,
    settings: Settings,
    userId: string
  ) => {
    const key = JSON.stringify([userId, seed.toLowerCase(), settings.research]);
    const hit = kept.get(key);
    if (hit !== undefined && Date.now() - hit.at < KEEP_MS) {
      return { ...hit.gathered, credits: { ...hit.gathered.credits, used: 0 } };
    }
    const gathered = await gather(client, qloo, seed, settings.research);
    kept.delete(key);
    kept.set(key, { at: Date.now(), gathered });
    const [oldest] = kept.keys();
    if (kept.size > 50 && oldest !== undefined) {
      kept.delete(oldest);
    }
    return gathered;
  };
  return {
    brief: async (id: string) => await pollBrief(client, id),
    research: async (input: TrendSeed, settings: Settings, userId: string) =>
      scored(await gatherOnce(input.seed, settings, userId), input, settings),
    // A competitor's landing pages, for the ads flow's angles.
    scanSite: async (url: string) => {
      const reply = await client.crawl(url, {
        extractDepth: "basic",
        format: "text",
        includeUsage: true,
        instructions:
          "Pages that state the offer: headlines, prices, discounts, guarantees, reviews",
        limit: 5,
        maxDepth: 1,
        timeout: TIMEOUT_S,
      });
      const pages = reply.results.flatMap((page) =>
        isWebUrl(page.url)
          ? [{ excerpt: clip(page.rawContent, TEXT_MAX), url: page.url }]
          : []
      );
      return { credits: creditsOf([reply]), pages: pages.slice(0, 5) };
    },
    screen: async (phrase: string) => {
      const query = `"${phrase.replaceAll('"', "")}" trademark`;
      const { results } = await searchWeb(client, query, {
        exactMatch: true,
        maxResults: 5,
        topic: "general",
      });
      return results.map(sourceOf);
    },
  };
};
export type TrendResearch = ReturnType<typeof createTrendResearch>;

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
