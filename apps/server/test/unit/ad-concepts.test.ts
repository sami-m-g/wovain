import { adSchema, adStatusOf, mergeConcepts } from "@wovain/shared/ad";
import type { AdConcept } from "@wovain/shared/ad";
import { expect, test } from "vitest";

const concept = (id: string, status: AdConcept["status"]): AdConcept => ({
  angle: "Gift",
  assets: [
    {
      alt: "Mockup",
      kind: "image",
      ratio: "1:1",
      source: "fourthwall",
      status: "ready",
      url: "https://cdn.fourthwall.com/x.webp",
    },
  ],
  audience: "Cat people",
  cta: "SHOP_NOW",
  headlines: ["Sakura Season Cat Tee"],
  hook: "For the friend whose cat runs the house.",
  id,
  name: id,
  primaryTexts: ["A calico watches the sun go down."],
  revision: 1,
  status,
});

test("a product is added once every concept is decided and one is approved", () => {
  expect(adStatusOf([concept("c1", "approved"), concept("c2", "draft")])).toBe(
    "draft"
  );
  expect(
    adStatusOf([concept("c1", "approved"), concept("c2", "skipped")])
  ).toBe("added");
  expect(adStatusOf([concept("c1", "skipped")])).toBe("skipped");
});

test("merging revises the named concept and appends new ones", () => {
  const merged = mergeConcepts(
    [concept("c1", "approved"), concept("c2", "skipped")],
    [
      { ...concept("c2", "draft"), feedback: "more playful" },
      concept("c3", "draft"),
    ]
  );
  expect(merged.map((c) => [c.id, c.revision, c.status])).toEqual([
    ["c1", 1, "approved"],
    ["c2", 2, "draft"],
    ["c3", 1, "draft"],
  ]);
});

test("a stored ad from before concepts reads as one concept", () => {
  const ad = adSchema.parse({
    coach: "Two clips.",
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
    headline: "Sakura Season Cat Tee",
    primaryText: "A calico watches the sun go down.",
    productTitle: "Japanese Cat Sunset Tee",
    rules: {
      alertAbove: 10.32,
      killDesignAt: 41.28,
      killExpensiveAbove: 15.48,
      killNoSalesAt: 30.96,
      scaleStepPct: 20,
      scaleUnder: 8.26,
    },
    staticImage: { alt: "Black tee", url: "https://cdn.fourthwall.com/x.webp" },
    status: "added",
    videos: [
      {
        angle: "UGC on-model",
        seconds: 15,
        slot: "A",
        status: "ready",
        url: "https://v3b.fal.media/a.mp4",
      },
    ],
  });
  expect(ad.status).toBe("added");
  expect(ad.concepts).toMatchObject([
    {
      assets: [
        { kind: "video", ratio: "9:16", url: "https://v3b.fal.media/a.mp4" },
      ],
      headlines: ["Sakura Season Cat Tee"],
      id: "c1",
      status: "approved",
    },
  ]);
});
