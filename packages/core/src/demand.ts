import { z } from "zod";

import { citationsOf } from "./evidence";
import type { Citation, TavilyWeb } from "./evidence";
import type { ToolCall } from "./upstream";

// Proof of demand for a print-on-demand theme (openspec drop-directions):
// what shops already pay to advertise, and what already sells. "What to
// sell now" ranks on this, not on a trend or a model's opinion.
//
// - Ads: the Meta Ad Library (ads_library_search, through the merchant's
//   Meta connection) for apparel ads on the theme. An ad still running
//   after 14 days is validated and after 30 days evergreen: advertisers
//   rarely keep paying for an ad that loses money (the tiers used by ad
//   research tools such as Adligator and Copyfy).
// - Marketplaces: Etsy, Amazon and Redbubble listings for the theme
//   (Tavily search), counting "Bestseller" badges and reviews, the signals
//   Etsy and Amazon show for what sells.
//
// A theme with neither is not suggested.

const DAY_MS = 24 * 60 * 60 * 1000;
export const VALIDATED_DAYS = 14;
export const EVERGREEN_DAYS = 30;
const AD_SAMPLE = 50;
const SAMPLES_KEPT = 3;
const MARKET_RESULTS = 10;
const MARKET_DOMAINS = ["etsy.com", "amazon.com", "redbubble.com"] as const;
// Reviews that count as proof on their own.
export const PROVEN_REVIEWS = 50;
// How fast demand points approach a full score.
const DEMAND_SCALE = 4;

const APPAREL =
  /\b(?:(?:t-?)?shirts?|tees?|hoodies?|sweat(?:shirt)?s?|apparel|merch|clothing|crewnecks?|tanks?)\b/iu;
// Shop and print-on-demand words in an ad or a shop's name.
const SHOP_TERMS =
  /\b(?:shop|store|boutique|outfitters?|threads|wear|tees?|merch|print(?:ed)?|graphic|designs?|collection|drop|order now|shop now|free shipping|\d+% off|sale)\b/iu;
// Where print-on-demand and small apparel shops land their ads.
const SHOP_DOMAINS = [
  "etsy.com",
  "amazon.com",
  "redbubble.com",
  "teepublic.com",
  "spreadshirt.com",
  "printful.com",
  "printify.com",
  "fourthwall.com",
  "myshopify.com",
  "bonfire.com",
  "teespring.com",
  "spring.com",
  "threadless.com",
  "zazzle.com",
  "society6.com",
] as const;
// What ads for the same words sell instead of a shirt: books and stories,
// cars, classes, apps, games and money.
const NOISE =
  /\b(?:novels?|books?|e-?books?|audiobooks?|chapters?|read (?:now|more|free)|episodes?|stories|cars?|trucks?|vehicles?|dealers?(?:hip)?|academy|lessons?|courses?|classes|tutoring|apps?|download|install|play now|games?|casino|bets?|loans?|insurance|mortgage|real estate|tickets?)\b/iu;
const BESTSELLER = /\bbest\s?-?seller\b/iu;
const REVIEWS = /(?<count>\d{1,3}(?:,\d{3})+|\d+)\s*(?:reviews|ratings)/giu;
const TOKEN = /[\p{L}\p{N}]{3,}/gu;

export interface AdDemand {
  // Distinct shops running a matching ad now.
  advertisers: number;
  // Shops whose ad has run 30 days or more.
  evergreen: number;
  longestDays: number;
  samples: { days: number; page: string; url: string }[];
  // Shops whose ad has run 14 days or more.
  validated: number;
}

export interface MarketDemand {
  // Listings showing a Bestseller badge.
  bestsellers: number;
  listings: Citation[];
  // Reviews counted on the matching listings.
  reviews: number;
}

export interface Demand {
  ads?: AdDemand | undefined;
  market?: MarketDemand | undefined;
  proven: boolean;
  // 0 to 1.
  score: number;
}

const tokensOf = (text: string) =>
  new Set<string>(text.toLowerCase().match(TOKEN));

// Whether a title is about the theme: it shares a word with it.
const about = (text: string, theme: ReadonlySet<string>) =>
  [...tokensOf(text)].some((token) => theme.has(token));

// MCP replies may carry the payload as a JSON string; read it either way.
const parsed = (value: unknown): unknown => {
  if (typeof value === "string") {
    try {
      return parsed(JSON.parse(value) as unknown);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map(parsed);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, parsed(child)])
    );
  }
  return value;
};

const strings = z.array(z.string().max(2000)).nullish();

const adSchema = z.object({
  ad_creative_bodies: strings,
  ad_creative_link_captions: strings,
  ad_creative_link_descriptions: strings,
  ad_creative_link_title: z.string().max(500).nullish(),
  ad_delivery_start_time: z.union([z.number(), z.string()]).nullish(),
  ad_snapshot_url: z.string().url().nullish(),
  page_id: z.union([z.number(), z.string()]),
  page_name: z.string().max(300).nullish(),
});

const adsOf = (reply: unknown): z.output<typeof adSchema>[] => {
  const found: z.output<typeof adSchema>[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const ad = adSchema.safeParse(item);
        if (ad.success) {
          found.push(ad.data);
        } else {
          walk(item);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      for (const child of Object.values(value)) {
        walk(child);
      }
    }
  };
  walk(parsed(reply));
  return found;
};

const startOf = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return;
  }
  const seconds = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }
  const date = Date.parse(String(value));
  return Number.isNaN(date) ? undefined : date;
};

type Ad = z.output<typeof adSchema>;

const onShopDomain = (captions: readonly string[]) =>
  captions.some((caption) => {
    const host = caption.toLowerCase().trim();
    return SHOP_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  });

// Whether an ad sells apparel about the theme: it names the theme, it
// shows a product (an apparel word in what it says, or a shop name and a
// shop-like landing), and it isn't a book, car, class, app or game ad.
export const sellsApparel = (ad: Ad, theme: ReadonlySet<string>) => {
  const says = [
    ad.ad_creative_link_title ?? "",
    ...(ad.ad_creative_bodies ?? []),
    ...(ad.ad_creative_link_descriptions ?? []),
  ].join(" ");
  const page = ad.page_name ?? "";
  if (!about(`${says} ${page}`, theme)) {
    return false;
  }
  const product = APPAREL.test(says) || APPAREL.test(page);
  const shop =
    onShopDomain(ad.ad_creative_link_captions ?? []) &&
    (SHOP_TERMS.test(says) || SHOP_TERMS.test(page));
  if (!product && !shop) {
    return false;
  }
  return !NOISE.test(says) || APPAREL.test(says);
};

// Apparel ads about the theme running now in the country, by shop.
export const adDemandOf = async (
  call: ToolCall,
  theme: string,
  { country = "US", now = Date.now() }: { country?: string; now?: number } = {}
): Promise<AdDemand> => {
  const reply = await call("ads_library_search", {
    ad_active_status: "ACTIVE",
    advertiser_job: "creative_insights_and_ideas",
    countries: [country],
    limit: AD_SAMPLE,
    search_terms: `${theme} shirt`,
  });
  const words = tokensOf(theme);
  const byShop = new Map<string, { days: number; page: string; url: string }>();
  for (const ad of adsOf(reply)) {
    const started = startOf(ad.ad_delivery_start_time);
    if (!sellsApparel(ad, words) || started === undefined) {
      continue;
    }
    const days = Math.max(0, Math.floor((now - started) / DAY_MS));
    const shop = String(ad.page_id);
    const known = byShop.get(shop);
    if (known === undefined || days > known.days) {
      byShop.set(shop, {
        days,
        page: ad.page_name ?? shop,
        url: ad.ad_snapshot_url ?? "",
      });
    }
  }
  const shops = [...byShop.values()].toSorted((a, b) => b.days - a.days);
  return {
    advertisers: shops.length,
    evergreen: shops.filter((one) => one.days >= EVERGREEN_DAYS).length,
    longestDays: shops[0]?.days ?? 0,
    samples: shops.filter((one) => one.url !== "").slice(0, SAMPLES_KEPT),
    validated: shops.filter((one) => one.days >= VALIDATED_DAYS).length,
  };
};

const reviewsIn = (text: string) =>
  Math.max(
    0,
    ...[...text.matchAll(REVIEWS)].map((match) =>
      Number((match.groups?.["count"] ?? "0").replaceAll(",", ""))
    )
  );

// Listings about the theme on Etsy, Amazon and Redbubble: bestseller
// badges and reviews.
export const marketDemandOf = async (
  tavily: Pick<TavilyWeb, "search">,
  theme: string
): Promise<MarketDemand> => {
  const reply = await tavily.search(`"${theme.replaceAll('"', "")}" shirt`, {
    includeDomains: [...MARKET_DOMAINS],
    maxResults: MARKET_RESULTS,
    searchDepth: "basic",
    timeout: 12,
  });
  const words = tokensOf(theme);
  const relevant = reply.results.filter((hit) => about(hit.title, words));
  const selling = relevant.filter(
    (hit) =>
      BESTSELLER.test(`${hit.title} ${hit.content}`) ||
      reviewsIn(hit.content) > 0
  );
  return {
    bestsellers: relevant.filter((hit) =>
      BESTSELLER.test(`${hit.title} ${hit.content}`)
    ).length,
    listings: citationsOf(selling).slice(0, SAMPLES_KEPT),
    reviews: relevant.reduce((sum, hit) => sum + reviewsIn(hit.content), 0),
  };
};

// One number for the proof: long-running ads count most, then bestsellers
// and reviews, then any advertiser. Proven when at least one shop has kept
// an ad running two weeks, a listing is a bestseller, or the listings have
// PROVEN_REVIEWS reviews.
export const demandOf = (
  ads: AdDemand | undefined,
  market?: MarketDemand
): Demand => {
  const points =
    (ads === undefined
      ? 0
      : ads.evergreen * 2 +
        (ads.validated - ads.evergreen) +
        0.25 * (ads.advertisers - ads.validated)) +
    (market === undefined
      ? 0
      : market.bestsellers * 1.5 + Math.log10(1 + market.reviews));
  const proven =
    (ads?.validated ?? 0) > 0 ||
    (market?.bestsellers ?? 0) > 0 ||
    (market?.reviews ?? 0) >= PROVEN_REVIEWS;
  return {
    ads,
    market,
    proven,
    score: 1 - Math.exp(-points / DEMAND_SCALE),
  };
};
