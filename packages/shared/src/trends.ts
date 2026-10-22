import { z } from "zod";

// Trend research (research_trends, get_niche_brief, scan_competitor_site),
// the trademark screen (screen_trademark) and the audience suggestion
// (suggest_audience): Tavily and Qloo's Taste API at runtime. Nothing here is
// stored. Every input is bounded: each call spends Tavily credits or Qloo
// quota.

export const SOURCE_TITLE_MAX = 300;
export const THEME_MAX = 120;
export const TEXT_MAX = 1200;
const MAX_ITEMS = 5;
const NOTE = z.string().max(600).optional();

export const trendSeedSchema = z.object({
  // Active Meta ads per theme, from the agent's Ad Library search.
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

// Every input of an idea's score (score.ts), so it can be checked and
// recalibrated. Shares are 0..1.
const signalsSchema = z.object({
  activeAds: z.int().min(0).optional(),
  affinity: z.number().optional(),
  bestSellers: z.int().min(0),
  ipSafety: z.number(),
  margin: z.number(),
  marketHits: z.int().min(0),
  newsHits: z.int().min(0),
  ownMatches: z.int().min(0),
  priceFloor: z.number().optional(),
  priceMedian: z.number().optional(),
  recency: z.number(),
  relevance: z.number(),
  velocity: z.number().optional(),
});
export type IdeaSignals = z.infer<typeof signalsSchema>;

// A ranked theme with its evidence: code ranks it, the agent phrases it.
const trendIdeaSchema = z.object({
  answer: z.string().max(TEXT_MAX).optional(),
  competitors: z
    .array(
      sourceSchema.extend({
        bestSeller: z.boolean().optional(),
        price: z.string().max(16).optional(),
        reviews: z.string().max(32).optional(),
      })
    )
    .max(3),
  moment: z.string().max(SOURCE_TITLE_MAX).optional(),
  ownProducts: z.array(webUrlSchema).max(MAX_ITEMS).optional(),
  rank: z.int().min(1).max(MAX_ITEMS),
  // Mood-board images for the art brief: never to copy.
  references: z
    .array(
      z.object({
        description: z.string().max(400).optional(),
        url: webUrlSchema,
      })
    )
    .max(4),
  score: z.number().min(0).max(1),
  signals: signalsSchema,
  sources: z.array(sourceSchema).min(1).max(MAX_ITEMS),
  tags: z.array(qlooTagSchema).min(1).max(3).optional(),
  taste: z.string().max(200).optional(),
  theme: z.string().max(THEME_MAX),
});
export type TrendIdea = z.infer<typeof trendIdeaSchema>;

export const trendsResultSchema = z.object({
  // Names Qloo matched (brands, artists, titles): never put them on a tee.
  avoidNames: z.array(z.string().max(300)).max(3).optional(),
  // The niche brief started in the background: poll get_niche_brief.
  briefId: z.string().max(100).optional(),
  configured: z.boolean(),
  credits: z
    .object({ cap: z.int().min(0), used: z.number().min(0) })
    .optional(),
  ideas: z.array(trendIdeaSchema).max(MAX_ITEMS).optional(),
  note: NOTE,
  qloo: z.enum(["used", "not_configured", "no_match", "failed"]).optional(),
  shop: z.enum(["checked", "not_set", "over_budget", "failed"]).optional(),
});

export const briefInputSchema = z.object({
  id: z.string().regex(/^[\w-]{1,100}$/u),
});

export const briefResultSchema = z.object({
  brief: z
    .object({
      angles: z.array(z.string().max(300)).max(MAX_ITEMS),
      audience: z.string().max(TEXT_MAX).optional(),
      priceBand: z.string().max(200).optional(),
      risks: z.array(z.string().max(300)).max(MAX_ITEMS),
    })
    .optional(),
  configured: z.boolean(),
  credits: z.number().min(0).optional(),
  note: NOTE,
  sources: z
    .array(sourceSchema.partial({ title: true }))
    .max(10)
    .optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]).optional(),
});

export const siteInputSchema = z.object({ url: webUrlSchema });

export const siteResultSchema = z.object({
  configured: z.boolean(),
  credits: z.number().min(0).optional(),
  note: NOTE,
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

// Qloo's aggregate audience: affinity by age band and gender, and the places
// where the theme's affinity is highest.
export const audienceSchema = z.object({
  ages: z.record(z.string().max(32), z.number()).optional(),
  genders: z.record(z.string().max(16), z.number()).optional(),
  locations: z
    .array(
      z.object({
        affinity: z.number().optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
    )
    .max(MAX_ITEMS),
});

export const audienceResultSchema = audienceSchema.partial().extend({
  configured: z.boolean(),
  note: NOTE,
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

// A niche brief this merchant started (Tavily Research's request ID), so
// get_niche_brief answers only its owner.
export const briefRecordSchema = z.object({ id: z.string().max(100) });
