import { storedAdSchema } from "@wovain/shared/ad";
import { designSchema, stagedArtworkSchema } from "@wovain/shared/design";
import { expect, test } from "vitest";

// Firestore documents as wovain saved them before the shared schemas (#16).
// There are no migrations, so these must keep parsing.
const quote = {
  baseCost: 17.7,
  breakevenPerSale: 10.32,
  cardFees: 1.38,
  marginPct: 41,
  price: 30,
  profit: 12.3,
  refundReserve: 0.6,
  roas: 2.9,
};

const oldDesign = {
  artwork: {
    requiredPx: 1800,
    transparent: true,
    url: "https://cdn.fourthwall.com/customizations/art.png",
    widthPx: 4500,
  },
  blank: { catalogProductId: "pro_1", name: "Bella+Canvas 3001 tee" },
  coach: "Soft bestseller tee.",
  colors: [{ hex: "#111111", inStock: true, name: "Black" }],
  customizationId: "cus_1",
  id: "d1",
  idea: "Japanese cat sunset",
  listing: { description: "Two lines.", title: "Japanese Cat Sunset Tee" },
  mockups: [{ alt: "Black tee", color: "Black", url: "https://x.test/b.webp" }],
  placement: { area: "Front", printSize: "12×16 in", style: "large center" },
  quote,
  range: [],
  rejectCount: 0,
  sizes: [{ baseCost: 17.7, inStock: true, size: "M" }],
  status: "live",
};

const oldAd = {
  coach: "Two angles.",
  concepts: [
    {
      angle: "Gift",
      assets: [
        { alt: "Mockup", kind: "image", ratio: "1:1", source: "fourthwall" },
      ],
      audience: "Cat people",
      cta: "SHOP_NOW",
      headlines: ["Sakura Season Cat Tee"],
      hook: "For the friend whose cat runs the house.",
      id: "c1",
      name: "Gift",
      primaryTexts: ["A calico watches the sun go down."],
    },
  ],
  designId: "d1",
  economics: {
    baseCost: 17.7,
    breakevenPerSale: 10.32,
    cardFees: 1.38,
    price: 30,
    refundReserve: 0.6,
    roas: 2.9,
    roasOnOrderValue: 3.6,
  },
  productTitle: "Japanese Cat Sunset Tee",
  rules: {
    alertAbove: 10.32,
    killDesignAt: 41.28,
    killExpensiveAbove: 15.48,
    killNoSalesAt: 30.96,
    scaleStepPct: 20,
    scaleUnder: 8.26,
  },
  staticImage: { alt: "Black tee", url: "https://x.test/b.webp" },
  status: "draft",
};

test("an old design document still parses, quote and all", () => {
  expect(designSchema.parse(oldDesign).quote).toEqual(quote);
});

test("an old ad document still parses, economics and rules and all", () => {
  const ad = storedAdSchema.parse(oldAd);
  expect(ad.economics).toEqual(oldAd.economics);
  expect(ad.rules).toEqual(oldAd.rules);
});

test("an old staged artwork record still parses", () => {
  const artwork = {
    bytes: 1200,
    contentType: "image/png",
    height: 32,
    id: "a1",
    key: "users/u1/artwork/a1.png",
    transparent: true,
    width: 64,
  };
  expect(stagedArtworkSchema.parse(artwork)).toEqual(artwork);
});
