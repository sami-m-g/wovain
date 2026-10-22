import { z } from "zod";

// Trend research (research_trends, get_niche_brief, scan_competitor_site),
// the trademark screen (screen_trademark) and the audience suggestion
// (suggest_audience): Tavily and Qloo's Taste API at runtime. Nothing here is
// stored. Every input is bounded: each call spends Tavily credits or Qloo
// quota.

export const SOURCE_TITLE_MAX = 300;
export const THEME_MAX = 120;
const MAX_ITEMS = 5;
const TEXT_MAX = 1200;

export const trendSeedSchema = z.object({
  // Active Meta ads per theme, from the host agent's own Ad Library search;
  // they raise that theme's demand.
  adCounts: z
    .array(
      z.object({
        activeAds: z.int().min(0).max(100_000),
        theme: z.string().trim().min(1).max(THEME_MAX),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  count: z.int().min(1).max(MAX_ITEMS).optional(),
  seed: z.string().trim().min(1).max(200),
});
export type TrendSeed = z.infer<typeof trendSeedSchema>;

// Links come from the web, so only http and https are let through.
export const webUrlSchema = z.url({ protocol: /^https?$/u }).max(2048);
export const isWebUrl = (url: string) => webUrlSchema.safeParse(url).success;

// A web page as wovain passes it on: an idea's source, a trademark hit.
const sourceSchema = z.object({
  publishedDate: z.string().max(64).optional(),
  title: z.string().max(SOURCE_TITLE_MAX),
  url: webUrlSchema,
});

// A Qloo tag ID, such as urn:tag:genre:music:synthwave.
const qlooTagSchema = z
  .string()
  .max(200)
  .regex(/^urn:tag:[\w.:-]+$/u);
export const isQlooTag = (value: string) =>
  qlooTagSchema.safeParse(value).success;

// Every input of an idea's score, so the merchant (and later real sales) can
// check and recalibrate it. Shares are 0..1.
const signalsSchema = z.object({
  activeAds: z.int().min(0).optional(),
  // Qloo: how strongly the seed's fans like the theme.
  affinity: z.number().optional(),
  // Competitor listings whose page says best seller.
  bestSellers: z.int().min(0),
  // 0 when the theme names a brand, artist or title Qloo matched.
  ipSafety: z.number(),
  margin: z.number(),
  marketHits: z.int().min(0),
  newsHits: z.int().min(0),
  // Products already in the merchant's own shop that match the theme.
  ownMatches: z.int().min(0),
  // The merchant's clean price for a typical tee, from their settings.
  priceFloor: z.number().optional(),
  // The median competitor price seen on the listings.
  priceMedian: z.number().optional(),
  // How new this week's headlines are.
  recency: z.number(),
  // Tavily's mean relevance score for the theme's results.
  relevance: z.number(),
  // Qloo: the seed's rank velocity over the past 4 weeks.
  velocity: z.number().optional(),
});
export type IdeaSignals = z.infer<typeof signalsSchema>;

const competitorSchema = sourceSchema.extend({
  bestSeller: z.boolean().optional(),
  price: z.string().max(16).optional(),
  reviews: z.string().max(32).optional(),
});
export type Competitor = z.infer<typeof competitorSchema>;

// Reference images for the art brief: never to copy.
const referenceSchema = z.object({
  description: z.string().max(400).optional(),
  url: webUrlSchema,
});

// A ranked theme with its evidence. The host agent phrases the idea, its
// angle and why from it; code computes the rank.
const trendIdeaSchema = z.object({
  // Tavily's own answer for the theme's news: untrusted text.
  answer: z.string().max(TEXT_MAX).optional(),
  competitors: z.array(competitorSchema).max(3),
  // This week's headline the idea can hang on: the ad copy's hook.
  moment: z.string().max(SOURCE_TITLE_MAX).optional(),
  // The merchant's own products that already cover the theme.
  ownProducts: z.array(webUrlSchema).max(MAX_ITEMS).optional(),
  rank: z.int().min(1).max(MAX_ITEMS),
  references: z.array(referenceSchema).max(4),
  score: z.number().min(0).max(1),
  signals: signalsSchema,
  sources: z.array(sourceSchema).min(1).max(MAX_ITEMS),
  // Qloo tag IDs, for suggest_audience.
  tags: z.array(qlooTagSchema).min(1).max(3).optional(),
  // Who loves it, from Qloo.
  taste: z.string().max(200).optional(),
  // The Qloo tag (or the seed) the idea grew from, as adCounts names it.
  theme: z.string().max(THEME_MAX),
});
export type TrendIdea = z.infer<typeof trendIdeaSchema>;

const creditsSchema = z.object({
  // The cap from settings (research.maxCredits).
  cap: z.int().min(0),
  // Credits Tavily reported for this call (include_usage).
  used: z.number().min(0),
});

const briefStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

// Results carry web text, so every result with any says it's untrusted.
export const trendsResultSchema = z.object({
  // Names Qloo matched (brands, artists, titles): never put them on a tee.
  avoidNames: z.array(z.string().max(300)).max(3).optional(),
  // The cited niche brief, started in the background: poll get_niche_brief.
  briefId: z.string().max(100).optional(),
  configured: z.boolean(),
  credits: creditsSchema.optional(),
  ideas: z.array(trendIdeaSchema).max(MAX_ITEMS).optional(),
  note: z.string().max(600).optional(),
  // Whether Qloo's taste graph shaped the themes, and if not, why.
  qloo: z.enum(["used", "not_configured", "no_match", "failed"]).optional(),
  // Whether the merchant's own shop was mapped for duplicates.
  shop: z.enum(["checked", "not_set", "over_budget", "failed"]).optional(),
});
export type QlooStatus = NonNullable<
  z.infer<typeof trendsResultSchema>["qloo"]
>;
export type ShopStatus = NonNullable<
  z.infer<typeof trendsResultSchema>["shop"]
>;

const briefIdSchema = z.string().regex(/^[\w-]{1,100}$/u);

export const briefInputSchema = z.object({ id: briefIdSchema });

// What Tavily Research fills in. Lenient: a field it skips is left out.
export const nicheBriefSchema = z.object({
  angles: z.array(z.string().max(300)).max(MAX_ITEMS).optional(),
  audience: z.string().max(TEXT_MAX).optional(),
  priceBand: z.string().max(200).optional(),
  risks: z.array(z.string().max(300)).max(MAX_ITEMS).optional(),
});

export const briefResultSchema = z.object({
  brief: nicheBriefSchema.optional(),
  configured: z.boolean(),
  credits: z.number().min(0).optional(),
  note: z.string().max(600).optional(),
  sources: z
    .array(sourceSchema.partial({ title: true }))
    .max(10)
    .optional(),
  status: briefStatusSchema.optional(),
});

export const siteInputSchema = z.object({ url: webUrlSchema });

export const siteResultSchema = z.object({
  configured: z.boolean(),
  credits: z.number().min(0).optional(),
  note: z.string().max(600).optional(),
  pages: z
    .array(z.object({ excerpt: z.string().max(TEXT_MAX), url: webUrlSchema }))
    .max(MAX_ITEMS)
    .optional(),
});

export const audienceInputSchema = z.object({
  tags: z.array(qlooTagSchema).min(1).max(3),
  // Where to look for the audience: a country, region or city.
  within: z.string().trim().min(1).max(80).optional(),
});

// Shares by age band and gender, as Qloo keys them.
export const agesSchema = z.record(z.string().max(32), z.number());
export const gendersSchema = z.record(z.string().max(16), z.number());
export const pointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Qloo's aggregate audience for a theme: affinity by age band and gender,
// and the places where the theme's affinity is highest.
const audienceSchema = z.object({
  ages: agesSchema.optional(),
  genders: gendersSchema.optional(),
  locations: z
    .array(pointSchema.extend({ affinity: z.number().optional() }))
    .max(MAX_ITEMS),
});
export type Audience = z.infer<typeof audienceSchema>;

export const audienceResultSchema = audienceSchema.partial().extend({
  configured: z.boolean(),
  note: z.string().max(400).optional(),
  within: z.string().max(80).optional(),
});

export const trademarkInputSchema = z.object({
  phrase: z.string().trim().min(1).max(120),
});

export const trademarkResultSchema = z.object({
  configured: z.boolean(),
  hits: z.array(sourceSchema).max(MAX_ITEMS).optional(),
  note: z.string().max(400).optional(),
  phrase: z.string().max(120).optional(),
});
