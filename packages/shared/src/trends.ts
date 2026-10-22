import { z } from "zod";

// Trend research (research_trends), the trademark screen (screen_trademark)
// and the audience suggestion (suggest_audience): Tavily search and Qloo's
// Taste API at runtime. Nothing here is stored. Every input is bounded: each
// call spends Tavily credits or Qloo quota.

export const IDEA_MAX = 120;
export const SOURCE_TITLE_MAX = 300;
export const THEME_MAX = 120;
const MAX_ITEMS = 5;

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
  count: z.int().min(3).max(MAX_ITEMS).optional(),
  seed: z.string().trim().min(1).max(200),
});
export type TrendSeed = z.infer<typeof trendSeedSchema>;

// Links come from web search, so only http and https are let through.
const webUrlSchema = z.url({ protocol: /^https?$/u }).max(2048);
export const isWebUrl = (url: string) => webUrlSchema.safeParse(url).success;

// A search result as wovain passes it on: an idea's source, a trademark hit.
const sourceSchema = z.object({
  publishedDate: z.string().max(64).optional(),
  title: z.string().max(SOURCE_TITLE_MAX),
  url: webUrlSchema,
});

const ideaFields = z.object({
  // What the tee could say or show, as a starting point for the design.
  angle: z.string().max(300),
  idea: z.string().min(1).max(IDEA_MAX),
  // Why it's current, in one line.
  why: z.string().max(300),
});

// A Qloo tag ID, such as urn:tag:genre:music:synthwave.
const qlooTagSchema = z
  .string()
  .max(200)
  .regex(/^urn:tag:[\w.:-]+$/u);
export const isQlooTag = (value: string) =>
  qlooTagSchema.safeParse(value).success;

// What a Qloo-scored idea's score came from, kept so real sales can
// recalibrate the weights later.
const signalsSchema = z.object({
  activeAds: z.int().min(0).optional(),
  affinity: z.number(),
  marketHits: z.int().min(0),
  newsHits: z.int().min(0),
  velocity: z.number().optional(),
});
export type IdeaSignals = z.infer<typeof signalsSchema>;

const competitorSchema = sourceSchema.extend({
  price: z.string().max(16).optional(),
});
export type Competitor = z.infer<typeof competitorSchema>;

// Taste (Qloo) and moment (Tavily), on ideas research found through Qloo.
const tasteFields = z.object({
  // Marketplace listings for the theme: what to position and price against.
  competitors: z.array(competitorSchema).max(3),
  // This week's headline the idea hangs on: the ad copy's hook.
  moment: z.string().max(SOURCE_TITLE_MAX),
  score: z.number().min(0).max(1),
  signals: signalsSchema,
  // Qloo tag IDs, for suggest_audience.
  tags: z.array(qlooTagSchema).min(1).max(3),
  // Who loves it, from Qloo.
  taste: z.string().max(200),
  // The Qloo tag the idea grew from, as adCounts names it.
  theme: z.string().max(THEME_MAX),
});

// Nemotron writes the angle and why; ideas ranked by relevance alone are a
// source's title and the source.
const trendIdeaSchema = ideaFields
  .partial({ angle: true, why: true })
  .extend({
    rank: z.int().min(1).max(MAX_ITEMS),
    sources: z.array(sourceSchema).min(1).max(MAX_ITEMS),
  })
  .extend(tasteFields.partial().shape);
export type TrendIdea = z.infer<typeof trendIdeaSchema>;

// Results carry web text, so every result with any says it's untrusted.
export const trendsResultSchema = z.object({
  configured: z.boolean(),
  ideas: z.array(trendIdeaSchema).max(MAX_ITEMS).optional(),
  note: z.string().max(400).optional(),
  // Whether Qloo's taste graph shaped the ideas, and if not, why.
  qloo: z.enum(["used", "not_configured", "no_match", "failed"]).optional(),
  // How the news-only path ranked its ideas. Absent when Qloo was used: code
  // ranks those by score.
  ranker: z.enum(["nemotron", "tavily"]).optional(),
});
export type TrendRanker = NonNullable<
  z.infer<typeof trendsResultSchema>["ranker"]
>;
export type QlooStatus = NonNullable<
  z.infer<typeof trendsResultSchema>["qloo"]
>;

// The first `count` ideas, ranked from 1.
export const ranked = <T extends object>(ideas: T[], count: number) =>
  ideas.slice(0, count).map((idea, index) => ({ ...idea, rank: index + 1 }));

// What Nemotron writes for each Qloo theme, by its number (from 1). It
// never ranks: the score is computed in code.
export const tasteReplySchema = z.object({
  ideas: z.array(ideaFields.extend({ n: z.int().min(1) })).max(MAX_ITEMS),
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

// What Nemotron sends: ideas citing the search results by their number
// (from 1), never by URL, so every link comes from Tavily.
export const trendReplySchema = z.object({
  ideas: z
    .array(
      ideaFields.extend({ sources: z.array(z.int().min(1)).max(MAX_ITEMS) })
    )
    .max(MAX_ITEMS),
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
