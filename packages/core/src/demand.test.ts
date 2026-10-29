import { expect, it, vi } from "vitest";

import {
  adDemandOf,
  demandOf,
  marketDemandOf,
  PROVEN_REVIEWS,
  sellsApparel,
} from "./demand";
import type { TavilyWeb } from "./evidence";

const DAY_S = 24 * 60 * 60;
const NOW_MS = Date.UTC(2026, 9, 29);
const ago = (days: number) => NOW_MS / 1000 - days * DAY_S;

// The Ad Library as Meta's MCP answers it: the payload is a JSON string.
const libraryReply = (
  ads: { days: number; page: number; title: string }[]
) => ({
  results: JSON.stringify({
    ads: ads.map((ad, index) => ({
      ad_creative_link_title: ad.title,
      ad_delivery_start_time: ago(ad.days),
      ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${index}`,
      id: String(index),
      page_id: ad.page,
      page_name: `Shop ${ad.page}`,
    })),
    estimated_total_count: ads.length,
  }),
});

it("counts the shops advertising the theme on apparel, and for how long", async () => {
  const call = vi.fn(
    async () =>
      await Promise.resolve(
        libraryReply([
          { days: 45, page: 1, title: "Vampire romance tee, 20% off" },
          { days: 40, page: 1, title: "Vampire romance hoodie" },
          { days: 20, page: 2, title: "Gothic vampire T-shirt drop" },
          { days: 3, page: 3, title: "Vampire romance shirt" },
          // Not apparel, and not about the theme.
          { days: 90, page: 4, title: "Vampire romance novel: read now" },
          { days: 90, page: 5, title: "Car T-Shirt Sale!" },
        ])
      )
  );
  const ads = await adDemandOf(call, "vampire romance", { now: NOW_MS });
  expect(call).toHaveBeenCalledWith(
    "ads_library_search",
    expect.objectContaining({
      ad_active_status: "ACTIVE",
      countries: ["US"],
      search_terms: "vampire romance shirt",
    })
  );
  expect(ads).toMatchObject({
    advertisers: 3,
    evergreen: 1,
    longestDays: 45,
    validated: 2,
  });
  expect(ads.samples[0]?.page).toBe("Shop 1");
});

const tavilyWith = (
  results: { content: string; title: string; url: string }[]
) =>
  ({
    search: vi.fn(
      async () =>
        await Promise.resolve({
          results: results.map((one) => ({ ...one, score: 0.8 })),
        })
    ),
  }) as unknown as Pick<TavilyWeb, "search">;

it("reads bestsellers and reviews on the marketplaces", async () => {
  const tavily = tavilyWith([
    {
      content: "Bestseller · 1,240 reviews · Moth crest tee",
      title: "Moth crest shirt",
      url: "https://www.etsy.com/listing/1",
    },
    {
      content: "4.8 out of 5 stars 312 ratings",
      title: "Moth crest graphic tee",
      url: "https://www.amazon.com/dp/2",
    },
    {
      content: "Bestseller · 9,000 reviews",
      title: "Unrelated mug",
      url: "https://www.etsy.com/listing/3",
    },
  ]);
  const market = await marketDemandOf(tavily, "moth crest");
  expect(market.bestsellers).toBe(1);
  expect(market.reviews).toBe(1552);
  expect(market.listings).toHaveLength(2);
});

it("proves demand with a two-week ad, a bestseller or enough reviews, and nothing else", () => {
  const none = { bestsellers: 0, listings: [], reviews: 0 };
  expect(demandOf(undefined, none).proven).toBe(false);
  expect(
    demandOf(
      {
        advertisers: 4,
        evergreen: 0,
        longestDays: 9,
        samples: [],
        validated: 0,
      },
      none
    ).proven
  ).toBe(false);
  expect(
    demandOf({
      advertisers: 1,
      evergreen: 0,
      longestDays: 15,
      samples: [],
      validated: 1,
    }).proven
  ).toBe(true);
  expect(demandOf(undefined, { ...none, bestsellers: 1 }).proven).toBe(true);
  expect(demandOf(undefined, { ...none, reviews: PROVEN_REVIEWS }).proven).toBe(
    true
  );
});

const adsWith = (evergreen: number, validated: number) => ({
  advertisers: 4,
  evergreen,
  longestDays: 40,
  samples: [],
  validated,
});

it("weighs evergreen ads above new ones", () => {
  const ads = adsWith;
  expect(demandOf(ads(3, 3)).score).toBeGreaterThan(demandOf(ads(0, 3)).score);
});

// What "gothic t-shirt" really returned from the Ad Library on 2026-10-29,
// plus the noise the filters must keep out.
const gothicNoise = [
  {
    ad_creative_link_title: "📖✨ It's amazing! Click to read now! 👉💖",
    page_name: "Wonderful novel story",
  },
  {
    ad_creative_link_title: "book.runswiftapp.com",
    page_name: "Operation Baseball & Softball Academy",
  },
  { ad_creative_link_title: "Car T-Shirt Sale!", page_name: "Car Threads" },
  {
    ad_creative_link_title: "Black Friday On The Pocket Tee",
    page_name: "LIOR",
  },
  {
    ad_creative_bodies: ["A gothic romance novel you can't put down"],
    ad_creative_link_title: "Read the gothic saga free",
    page_name: "Gothic Reads",
  },
  {
    ad_creative_bodies: ["Gothic cathedral tour, tickets on sale"],
    ad_creative_link_title: "Book your gothic tour",
    page_name: "City Tours",
  },
];

const gothicShops = [
  {
    ad_creative_link_title: "Gothic moth tee, 20% off this week",
    page_name: "Night Moth Studio",
  },
  {
    ad_creative_bodies: ["New gothic drop: printed to order, free shipping"],
    ad_creative_link_captions: ["nightmoth.myshopify.com"],
    ad_creative_link_title: "The Gothic Collection",
    page_name: "Night Moth",
  },
];

it("keeps out books, academies, cars and tours from a gothic t-shirt search", async () => {
  const ads = [...gothicNoise, ...gothicShops].map((ad, index) => ({
    ...ad,
    ad_delivery_start_time: ago(20),
    ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${index}`,
    page_id: index,
  }));
  const call = vi.fn(
    async () =>
      await Promise.resolve({
        results: JSON.stringify({ ads, estimated_total_count: ads.length }),
      })
  );
  const demand = await adDemandOf(call, "gothic", { now: NOW_MS });
  expect(demand.advertisers).toBe(2);
  expect(demand.samples.map((one) => one.page).toSorted()).toStrictEqual([
    "Night Moth",
    "Night Moth Studio",
  ]);
});

it.each(gothicNoise)("is not an apparel ad: $page_name", (ad) => {
  expect(sellsApparel({ ...ad, page_id: 1 }, new Set(["gothic"]))).toBe(false);
});

it.each(gothicShops)("is an apparel ad: $page_name", (ad) => {
  expect(sellsApparel({ ...ad, page_id: 1 }, new Set(["gothic"]))).toBe(true);
});
