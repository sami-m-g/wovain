import { z } from "zod";

// Trend research (research_trends) and the trademark screen
// (screen_trademark): Tavily search at runtime. Nothing here is stored.
// Every input is bounded: each call spends Tavily credits.

export const IDEA_MAX = 120;
export const SOURCE_TITLE_MAX = 300;
const MAX_ITEMS = 5;

export const trendSeedSchema = z.object({
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

// Nemotron writes the angle and why; ideas ranked by relevance alone are a
// source's title and the source.
const trendIdeaSchema = ideaFields.partial({ angle: true, why: true }).extend({
  rank: z.int().min(1).max(MAX_ITEMS),
  sources: z.array(sourceSchema).min(1).max(MAX_ITEMS),
});
export type TrendIdea = z.infer<typeof trendIdeaSchema>;

// Results carry web text, so every result with any says it's untrusted.
export const trendsResultSchema = z.object({
  configured: z.boolean(),
  ideas: z.array(trendIdeaSchema).max(MAX_ITEMS).optional(),
  note: z.string().max(400).optional(),
  ranker: z.enum(["nemotron", "tavily"]).optional(),
});
export type TrendRanker = NonNullable<
  z.infer<typeof trendsResultSchema>["ranker"]
>;

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
