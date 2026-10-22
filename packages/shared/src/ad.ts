import { z } from "zod";

// Everything the ad widget shows (prd.md > Ad widgets). Concepts, copy and
// visuals come from the ads playbook; economics and rules are computed by the
// server from the design's price, so the money numbers never come from the model.

// The two UGC clips video_plan makes per product.
export const adSlotSchema = z.enum(["A", "B"]);
export type AdSlot = z.infer<typeof adSlotSchema>;

// Meta's ratios: 1:1 and 4:5 for Feed, 9:16 for Stories and Reels.
export const adRatioSchema = z.enum(["1:1", "4:5", "9:16"]);
export type AdRatio = z.infer<typeof adRatioSchema>;

const adAssetSchema = z.object({
  alt: z.string().min(1).max(200),
  kind: z.enum(["image", "video"]),
  ratio: adRatioSchema,
  // fal output is AI-made (Meta's AI disclosure); Fourthwall mockups aren't.
  source: z.enum(["fal", "fourthwall"]),
  status: z.enum(["ready", "failed"]).default("ready"),
  url: z.url().optional(),
});
export type AdAsset = z.infer<typeof adAssetSchema>;

// One product per carousel card; the campaign plan adds each product's link.
const carouselCardSchema = z.object({
  designId: z.string().regex(/^d\d+$/u),
  headline: z.string().min(1).max(40),
  imageUrl: z.url(),
});

// Shopping CTAs Meta accepts on a sales ad.
export const adCtaSchema = z.enum([
  "SHOP_NOW",
  "BUY_NOW",
  "ORDER_NOW",
  "VIEW_PRODUCT",
  "LEARN_MORE",
]);

const conceptStatusSchema = z.enum(["draft", "approved", "skipped"]);
// The merchant's choice on one concept.
export const decisionSchema = conceptStatusSchema.exclude(["draft"]);
export type Decision = z.infer<typeof decisionSchema>;

// What the playbook writes for one concept. Text limits follow Meta's
// recommendation (125 characters of primary text show before "more", 40 of
// headline) and its 5 variants per field; primary text may run longer.
export const conceptInputSchema = z.object({
  angle: z.string().min(1).max(120),
  assets: z.array(adAssetSchema).max(6),
  // Who it's for: Qloo taste, or the playbook's own read of the buyer.
  audience: z.string().min(1).max(160),
  // Present on a carousel across the product set: 2 to 10 cards.
  cards: z.array(carouselCardSchema).min(2).max(10).optional(),
  cta: adCtaSchema,
  // What competitors' ads or listings miss that this one says.
  gap: z.string().min(1).max(160).optional(),
  headlines: z.array(z.string().min(1).max(40)).min(1).max(5),
  // The scroll-stopping first line or first second.
  hook: z.string().min(1).max(125),
  id: z.string().regex(/^c\d+$/u),
  name: z.string().min(1).max(40),
  primaryTexts: z.array(z.string().min(1).max(500)).min(1).max(5),
  // The news or seasonal moment that makes it timely (Tavily).
  whyNow: z.string().min(1).max(160).optional(),
});
// A new or revised concept: a revision carries the feedback that produced it.
export const conceptRevisionSchema = conceptInputSchema.extend({
  feedback: z.string().min(1).max(300).optional(),
});
export type ConceptRevision = z.infer<typeof conceptRevisionSchema>;

const adConceptSchema = conceptRevisionSchema
  .extend({
    revision: z.int().min(1).default(1),
    status: conceptStatusSchema.default("draft"),
  })
  .refine(
    (concept) => concept.cards !== undefined || concept.assets.length > 0,
    "a concept needs at least one image or video, or carousel cards"
  );
export type AdConcept = z.infer<typeof adConceptSchema>;

const adStatusSchema = z.enum(["draft", "added", "skipped"]);
export type AdStatus = z.infer<typeof adStatusSchema>;

// Before concepts, an ad was one headline, one primary text and up to two
// 9:16 clips. Stored records in that shape read as a single concept.
const upgradeLegacy = (value: unknown) => {
  const legacy = z
    .looseObject({
      concepts: z.never().optional(),
      headline: z.string(),
      primaryText: z.string(),
      status: adStatusSchema.default("draft"),
      videos: z.array(
        z.object({
          angle: z.string(),
          status: z.enum(["ready", "failed"]),
          url: z.string().optional(),
        })
      ),
    })
    .safeParse(value);
  if (!legacy.success) {
    return value;
  }
  const { headline, primaryText, status, videos, ...rest } = legacy.data;
  const conceptStatus = {
    added: "approved",
    draft: "draft",
    skipped: "skipped",
  };
  return {
    ...rest,
    concepts: [
      {
        angle: videos[0]?.angle ?? "UGC try-on",
        assets: videos.map((video) => ({
          alt: video.angle,
          kind: "video",
          ratio: "9:16",
          source: "fal",
          status: video.status,
          url: video.url,
        })),
        audience: "Advantage+ audience",
        cta: "SHOP_NOW",
        headlines: [headline.slice(0, 40)],
        hook: headline.slice(0, 125),
        id: "c1",
        name: "Try-on clips",
        primaryTexts: [primaryText],
        status: conceptStatus[status],
      },
    ],
    status,
  };
};

export const adSchema = z.object({
  coach: z.string().min(1).max(160),
  concepts: z.array(adConceptSchema).min(1).max(6),
  designId: z.string().regex(/^d\d+$/u),
  economics: z.object({
    baseCost: z.number(),
    breakevenPerSale: z.number(),
    cardFees: z.number(),
    price: z.number(),
    refundReserve: z.number(),
    roas: z.number(),
    roasOnOrderValue: z.number(),
  }),
  productTitle: z.string().min(1),
  rules: z.object({
    alertAbove: z.number(),
    killDesignAt: z.number(),
    killExpensiveAbove: z.number(),
    killNoSalesAt: z.number(),
    scaleStepPct: z.number(),
    scaleUnder: z.number(),
  }),
  staticImage: z.object({ alt: z.string().min(1), url: z.url() }),
  status: adStatusSchema.default("draft"),
});
export type Ad = z.infer<typeof adSchema>;

// How the store reads ads: records from before concepts are upgraded.
export const storedAdSchema = z.preprocess(upgradeLegacy, adSchema);

export const adResultSchema = z.object({ ad: adSchema });

// The concepts that become Meta ads.
export const approvedConcepts = (ad: Ad) =>
  ad.concepts.filter((concept) => concept.status === "approved");

// A product's ads are decided once every concept is approved or skipped.
export const adStatusOf = (concepts: AdConcept[]): AdStatus => {
  if (concepts.some((concept) => concept.status === "draft")) {
    return "draft";
  }
  return concepts.some((concept) => concept.status === "approved")
    ? "added"
    : "skipped";
};

// A redraw passes new or revised concepts only: a revised one goes back to
// draft with the next revision number; the others keep their choice.
export const mergeConcepts = (
  current: AdConcept[],
  incoming: ConceptRevision[]
): AdConcept[] => {
  const byId = new Map(incoming.map((concept) => [concept.id, concept]));
  const revise = (
    concept: (typeof incoming)[number],
    previous?: AdConcept
  ) => ({
    ...concept,
    revision: (previous?.revision ?? 0) + 1,
    status: "draft" as const,
  });
  const kept = current.map((concept) => {
    const next = byId.get(concept.id);
    return next === undefined ? concept : revise(next, concept);
  });
  const known = new Set(current.map((concept) => concept.id));
  return [
    ...kept,
    ...incoming.flatMap((concept) =>
      known.has(concept.id) ? [] : [revise(concept)]
    ),
  ];
};

// A ratio as the widget names it: "Feed 4:5", "Stories and Reels 9:16".
export const ratioLabel = (ratio: AdRatio) =>
  `${ratio === "9:16" ? "Stories and Reels" : "Feed"} ${ratio}`;
