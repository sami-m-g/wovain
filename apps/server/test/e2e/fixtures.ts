import { z } from "zod";

import { demoDesign, searchResult } from "../helpers.ts";

// Recorded replies for the journey: what the merchant's Fourthwall, fal and
// Meta answer, shaped as their tool descriptions document them. Mockup URLs
// name the Storybook mockups (tee-black, mug-white…) so the proof report's
// screenshots show real product art.
const ids = (value: unknown) => z.array(z.string()).parse(value);
const shop = "https://catclub.fourthwall.com";
const mockup = (name: string) =>
  `https://cdn.fourthwall.com/offer-renders/${name}.webp`;

type Tools = Record<
  string,
  (args: Record<string, unknown>) => Record<string, unknown>
>;

export const fourthwallTools: Tools = {
  "ecommerce_bulk-update-offer-variant-prices": () => ({ ok: true }),
  "ecommerce_create-collection": () => ({
    collection: { id: "cltn_1", offerIds: [], slug: "sunset-cat-drop" },
  }),
  "ecommerce_create-offers-from-designs": (args) => ({
    results: ids(args["customizationIds"]).map((id) => ({
      customizationId: id,
      offerId: `off_${id}`,
    })),
  }),
  "ecommerce_get-current-shop": () => ({
    shop: { baseUrl: shop, name: "Cat Club" },
  }),
  "ecommerce_get-offers-by-ids": (args) => ({
    offers: ids(args["offerIds"]).map((id) => ({ id, slug: `slug-${id}` })),
  }),
  "ecommerce_update-collection-state": () => ({
    collection: {
      id: "cltn_1",
      offerIds: [],
      slug: "sunset-cat-drop",
      state: "PUBLIC",
    },
  }),
  "ecommerce_update-offer-status": () => ({ ok: true }),
};

const product = (
  kind: string,
  name: string,
  customizationId: string,
  baseCost: number
) => ({
  ...demoDesign,
  blank: { catalogProductId: `pro_${customizationId}`, name },
  customizationId,
  kind,
  listing: {
    description: `The sunset cat on a ${kind.toLowerCase()}.`,
    title: `Japanese Cat Sunset ${kind}`,
  },
  mockups: [
    {
      alt: `${kind} mockup`,
      color: "Black",
      url: mockup(`${kind.toLowerCase()}-black`),
    },
  ],
  sizes: [{ baseCost, inStock: true, size: "One size" }],
});

// One idea as a drop: the hero tee plus a hoodie, a mug and a poster.
export const drop = {
  artwork: { ...demoDesign.artwork, url: "https://fal.media/files/cat.png" },
  blank: { badge: "Our pick", ...demoDesign.blank },
  coach: demoDesign.coach,
  colors: demoDesign.colors,
  customizationId: demoDesign.customizationId,
  dropName: "Sunset Cat Drop",
  idea: demoDesign.idea,
  listing: demoDesign.listing,
  mockups: [{ alt: "Black tee", color: "Black", url: mockup("tee-black") }],
  placement: demoDesign.placement,
  quote: demoDesign.quote,
  range: [
    product("Hoodie", "Cotton Heritage hoodie", "cus_hoodie", 27.5),
    {
      ...product("Mug", "11 oz mug", "cus_mug", 9.6),
      mockups: [{ alt: "Mug", color: "White", url: mockup("mug-white") }],
    },
    {
      ...product("Poster", "Matte poster", "cus_poster", 11),
      mockups: [{ alt: "Poster", color: "White", url: mockup("poster") }],
    },
  ],
  sizes: demoDesign.sizes,
};

// fal accepts each request as a job, and each job's result is one image on
// fal's CDN, named for the mockup it edits.
export const falTools: Tools = {
  check_account_status: () => ({ balance_usd: 25, ok: true }),
  get_job_result: (args) => ({
    images: [
      {
        url: `https://v3b.fal.media/files/ads/tee-black-${String(args["request_id"])}.jpg`,
      },
    ],
  }),
  submit_jobs: (args) => ({
    results: z
      .array(z.object({ endpoint_id: z.string(), index: z.int() }))
      .parse(args["requests"])
      .map((request) => ({
        ...request,
        request_id: `job${String(request.index + 1)}`,
      })),
  }),
};

// The ad widget's concepts: a lifestyle scene fal made and the mockup as a
// gift ad.
export const adConcepts = (scene: string) => [
  {
    angle: "Lifestyle",
    assets: [
      {
        alt: "Friends at a sunset picnic",
        kind: "image",
        ratio: "4:5",
        source: "fal",
        url: scene,
      },
    ],
    audience: "Cat owners who collect Japanese prints",
    cta: "SHOP_NOW",
    headlines: ["Sunset Cat Tee"],
    hook: "Golden hour, one very calm cat.",
    id: "c1",
    name: "Sunset picnic",
    primaryTexts: ["A calm cat watches the sun go down over Mount Fuji."],
  },
  {
    angle: "Gift for cat people",
    assets: [
      {
        alt: "Black tee",
        kind: "image",
        ratio: "1:1",
        source: "fourthwall",
        url: mockup("tee-black"),
      },
    ],
    audience: "Gift buyers with a cat-obsessed friend",
    cta: "SHOP_NOW",
    headlines: ["A gift for cat people"],
    hook: "For the friend whose cat runs the house.",
    id: "c2",
    name: "Gift",
    primaryTexts: ["For the friend whose cat runs the house."],
  },
];

// What every Meta Ads MCP call carries.
export const metaArgs = {
  advertiser_job: "create_and_launch_new_ads",
  client_conversation_id: "AbCdEfGhIj0123456789",
};

// Meta answers each create with the object's ID: campaign 555, ad set 666,
// media 8 (and an image hash), creative 901, ad 777, all staged paused.
export const metaTools: Tools = {
  ads_create_ad: () => ({ ad_id: "777", status: "DRAFT" }),
  ads_create_ad_set: () => ({ ad_set_id: "666", status: "DRAFT" }),
  ads_create_campaign: () => ({ campaign_id: "555", status: "DRAFT" }),
  ads_create_creative: () => ({ creative_id: "901" }),
  ads_creative_upload_media: () => ({
    image_hash: "0123456789abcdef0123456789abcdef",
    video_id: "8",
  }),
  ads_get_ad_accounts: () => ({
    data: [{ account_id: "42", currency: "USD", name: "Cat Club ads" }],
  }),
};

// What Tavily finds this week for "cat lovers".
export const trendNews = [
  searchResult(1, "Retro sunset cat art takes over gift shops", {
    publishedDate: new Date().toISOString(),
  }),
  searchResult(2, "Japanese woodblock cats trend on Etsy"),
  searchResult(3, "Cat cafe culture drives merch sales"),
];
