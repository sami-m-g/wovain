import { z } from "zod";

// Trend research (research_trends) and the trademark screen
// (screen_trademark): Tavily search at runtime. Nothing here is stored.
// Every input is bounded: each call spends Tavily credits.

export const trendSeedSchema = z.object({
  count: z.int().min(3).max(5).optional(),
  seed: z.string().trim().min(1).max(200),
});
export type TrendSeed = z.infer<typeof trendSeedSchema>;

const trendSourceSchema = z.object({
  publishedDate: z.string().max(64).optional(),
  title: z.string().max(300),
  url: z.url().max(2048),
});
export type TrendSource = z.infer<typeof trendSourceSchema>;

const trendIdeaSchema = z.object({
  // What the tee could say or show, as a starting point for the design.
  angle: z.string().max(300),
  idea: z.string().min(1).max(120),
  rank: z.int().min(1).max(5),
  sources: z.array(trendSourceSchema).min(1).max(5),
  // Why it's current, in one line.
  why: z.string().max(300),
});
export type TrendIdea = z.infer<typeof trendIdeaSchema>;

export const trendsResultSchema = z.object({
  configured: z.boolean(),
  ideas: z.array(trendIdeaSchema).max(5).optional(),
  ranker: z.enum(["nemotron", "rules"]).optional(),
});

// What Nemotron sends: ideas citing the numbered search results, never URLs,
// so every link comes from Tavily.
export const trendReplySchema = z.object({
  ideas: z
    .array(
      z.object({
        angle: z.string().max(300),
        idea: z.string().min(1).max(120),
        sources: z.array(z.int().min(0)).max(5),
        why: z.string().max(300),
      })
    )
    .max(5),
});
export type TrendReply = z.infer<typeof trendReplySchema>;

export const trademarkInputSchema = z.object({
  phrase: z.string().trim().min(1).max(120),
});

export const trademarkResultSchema = z.object({
  configured: z.boolean(),
  hits: z
    .array(z.object({ title: z.string().max(300), url: z.url().max(2048) }))
    .max(5)
    .optional(),
  note: z.string().max(400).optional(),
  phrase: z.string().max(120).optional(),
});
export type TrademarkResult = z.infer<typeof trademarkResultSchema>;
