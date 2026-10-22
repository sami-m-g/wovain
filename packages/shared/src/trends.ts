import { z } from "zod";

// Trend research (research_trends) and the trademark screen
// (screen_trademark): Tavily search at runtime. Nothing here is stored.
// Every input is bounded: each call spends Tavily credits.

export const IDEA_MAX = 120;
export const SOURCE_TITLE_MAX = 300;

export const trendSeedSchema = z.object({
  count: z.int().min(3).max(5).optional(),
  seed: z.string().trim().min(1).max(200),
});
export type TrendSeed = z.infer<typeof trendSeedSchema>;

// Links come from web search, so only http and https are let through.
const webUrlSchema = z.url({ protocol: /^https?$/u }).max(2048);
export const isWebUrl = (url: string) => webUrlSchema.safeParse(url).success;

const ideaFields = z.object({
  // What the tee could say or show, as a starting point for the design.
  angle: z.string().max(300),
  idea: z.string().min(1).max(IDEA_MAX),
  // Why it's current, in one line.
  why: z.string().max(300),
});

const trendIdeaSchema = ideaFields.extend({
  rank: z.int().min(1).max(5),
  sources: z
    .array(
      z.object({
        publishedDate: z.string().max(64).optional(),
        title: z.string().max(SOURCE_TITLE_MAX),
        url: webUrlSchema,
      })
    )
    .min(1)
    .max(5),
});
export type TrendIdea = z.infer<typeof trendIdeaSchema>;

// Results carry web text, so every result with any says it's untrusted.
export const trendsResultSchema = z.object({
  configured: z.boolean(),
  ideas: z.array(trendIdeaSchema).max(5).optional(),
  note: z.string().max(400).optional(),
  ranker: z.enum(["nemotron", "rules"]).optional(),
});

// What Nemotron sends: ideas citing the numbered search results, never URLs,
// so every link comes from Tavily.
export const trendReplySchema = z.object({
  ideas: z
    .array(ideaFields.extend({ sources: z.array(z.int().min(0)).max(5) }))
    .max(5),
});

export const trademarkInputSchema = z.object({
  phrase: z.string().trim().min(1).max(120),
});

export const trademarkResultSchema = z.object({
  configured: z.boolean(),
  hits: z
    .array(
      z.object({ title: z.string().max(SOURCE_TITLE_MAX), url: webUrlSchema })
    )
    .max(5)
    .optional(),
  note: z.string().max(400).optional(),
  phrase: z.string().max(120).optional(),
});
