import { isWebUrl } from "@wovain/shared/trends";
import type { Competitor } from "@wovain/shared/trends";

import { clip, createMeter, sourceOf, TIMEOUT_S } from "./tavily.ts";
import type { Meter, SearchResult, TavilyApi } from "./tavily.ts";

// The market around an idea, through Tavily: competitor listings (extract),
// the merchant's own shop (map) and a competitor's landing pages (crawl).
// Page text is untrusted: only prices, review counts and badges are read
// from it, and excerpts leave wovain marked untrusted.

const PRICE = /\$\d{1,4}(?:\.\d{2})?/u;
const REVIEWS = /\d[\d,.]*k?\s+(?:reviews|ratings|sales)/iu;
const BEST_SELLER = /best[\s-]?seller/iu;
const LICENSED = /officially licensed/iu;
const PAGE_MAX = 4000;
// Product pages mapped on the merchant's shop: up to 4 credits.
export const SHOP_PAGES = 40;

export interface Page {
  bestSeller: boolean;
  licensed: boolean;
  price?: string;
  reviews?: string;
}

const pageOf = (text: string): Page => {
  const head = text.slice(0, PAGE_MAX);
  const price = PRICE.exec(head)?.[0];
  const reviews = REVIEWS.exec(head)?.[0];
  return {
    bestSeller: BEST_SELLER.test(head),
    licensed: LICENSED.test(head),
    ...(price === undefined ? {} : { price }),
    ...(reviews === undefined ? {} : { reviews: clip(reviews, 32) }),
  };
};

// The top listings' price, reviews and best-seller badge, in one extract.
export const readListings = async (
  client: TavilyApi,
  meter: Meter,
  urls: string[]
): Promise<Map<string, Page>> => {
  if (urls.length === 0) {
    return new Map();
  }
  const { results } = meter.add(
    await client.extract(urls, {
      chunksPerSource: 3,
      extractDepth: "basic",
      includeUsage: true,
      query: "price, number of reviews or sales, best seller badge",
      timeout: TIMEOUT_S,
    })
  );
  return new Map(results.map((page) => [page.url, pageOf(page.rawContent)]));
};

// The merchant's product pages.
export const mapShop = async (
  { map: mapSite }: TavilyApi,
  meter: Meter,
  url: string
) => {
  const { results } = meter.add(
    await mapSite(url, {
      includeUsage: true,
      limit: SHOP_PAGES,
      maxDepth: 2,
      selectPaths: ["/products/.+"],
      timeout: TIMEOUT_S,
    })
  );
  return results.filter((page) => isWebUrl(page));
};

export const competitorOf = (hit: SearchResult, page?: Page): Competitor => {
  const price = page?.price ?? PRICE.exec(hit.content)?.[0];
  return {
    ...sourceOf(hit),
    ...(page?.bestSeller === true ? { bestSeller: true } : {}),
    ...(price === undefined ? {} : { price }),
    ...(page?.reviews === undefined ? {} : { reviews: page.reviews }),
  };
};

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((word) => word.length >= 4)
  );

// The merchant's products whose path shares a word with the theme.
export const ownMatches = (theme: string, own: string[]) => {
  const wanted = words(theme);
  return own.filter((url) =>
    [...words(new URL(url).pathname)].some((word) => wanted.has(word))
  );
};

// 0 when the theme names a brand, artist or title Qloo matched; 0.5 when a
// top listing says it's officially licensed.
export const ipSafetyOf = (
  theme: string,
  names: string[],
  pages: (Page | undefined)[]
) => {
  const lowered = theme.toLowerCase();
  if (
    names.some(
      (name) => name.length >= 3 && lowered.includes(name.toLowerCase())
    )
  ) {
    return 0;
  }
  return pages.some((page) => page?.licensed === true) ? 0.5 : 1;
};

// A competitor's landing pages, for the ads flow's angles.
export const scanSite = async (client: TavilyApi, url: string) => {
  const meter = createMeter();
  const { results } = meter.add(
    await client.crawl(url, {
      extractDepth: "basic",
      format: "text",
      includeUsage: true,
      instructions:
        "Pages that state the product offer: headlines, prices, discounts, guarantees and reviews",
      limit: 5,
      maxDepth: 1,
      timeout: TIMEOUT_S,
    })
  );
  return {
    credits: meter.used,
    pages: results
      .filter((page) => isWebUrl(page.url))
      .slice(0, 5)
      .map((page) => ({ excerpt: clip(page.rawContent, 1200), url: page.url })),
  };
};
