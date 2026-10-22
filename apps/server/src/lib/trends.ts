import { trendReplySchema } from "@wovain/shared/trends";
import type { TrendIdea, TrendSeed } from "@wovain/shared/trends";
import type { Genkit } from "genkit";

import { createAi, generateObject, models } from "./ai.ts";
import { createSearch } from "./tavily.ts";
import type { Search, SearchHit } from "./tavily.ts";

export interface TrendResearch {
  research: (
    input: TrendSeed
  ) => Promise<{ ideas: TrendIdea[]; ranker: "nemotron" | "rules" }>;
  screen: (phrase: string) => Promise<{ title: string; url: string }[]>;
}

const DEFAULT_COUNT = 5;
const DAY_MS = 86_400_000;
// A story loses half its weight every 3 days.
const HALF_LIFE_DAYS = 3;
const UNDATED_WEIGHT = 0.5;
const SNIPPET = 300;
const MIN_WORD = 4;

const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "amid",
  "best",
  "could",
  "first",
  "from",
  "have",
  "here",
  "into",
  "just",
  "latest",
  "make",
  "more",
  "most",
  "news",
  "over",
  "says",
  "than",
  "that",
  "their",
  "these",
  "they",
  "this",
  "trend",
  "trending",
  "trends",
  "week",
  "what",
  "when",
  "will",
  "with",
  "year",
  "your",
]);

const words = (value: string) =>
  value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_WORD && !STOP_WORDS.has(word));

export const recency = (hit: SearchHit, now: number) => {
  const published =
    hit.publishedDate === undefined
      ? Number.NaN
      : Date.parse(hit.publishedDate);
  if (Number.isNaN(published)) {
    return UNDATED_WEIGHT;
  }
  const ageDays = Math.max(0, (now - published) / DAY_MS);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
};

const toSource = ({ publishedDate, title, url }: SearchHit) => ({
  title: clip(title, SNIPPET),
  url,
  ...(publishedDate === undefined ? {} : { publishedDate }),
});

interface Group {
  indexes: number[];
  score: number;
  word?: string;
}

// Which results' titles share each keyword, leaving out the seed's own words.
const keywordIndex = (seed: string, hits: SearchHit[]) => {
  const seedWords = new Set(words(seed));
  const byWord = new Map<string, number[]>();
  const pairs = hits.flatMap((hit, index) =>
    [...new Set(words(hit.title))].flatMap((word) =>
      seedWords.has(word) ? [] : [[word, index] as const]
    )
  );
  for (const [word, index] of pairs) {
    byWord.set(word, [...(byWord.get(word) ?? []), index]);
  }
  return byWord;
};

// The keyword with the highest score among results not yet used. A keyword
// names a trend only when at least two sources share it.
const bestGroup = (
  byWord: Map<string, number[]>,
  used: Set<number>,
  score: (indexes: number[]) => number
): Group | undefined => {
  let best: Group | undefined;
  for (const [word, indexes] of byWord) {
    const free = indexes.filter((index) => !used.has(index));
    const value = score(free);
    if (free.length >= 2 && (best === undefined || value > best.score)) {
      best = { indexes: free, score: value, word };
    }
  }
  return best;
};

// The ranker without a model: results grouped by the title keyword they
// share, each group scored by source count × recency (the sum of its
// sources' recency weights). Single stories fill the remaining places.
export const rankByRules = (
  seed: string,
  hits: SearchHit[],
  count = DEFAULT_COUNT,
  now = Date.now()
): TrendIdea[] => {
  const weight = hits.map((hit) => recency(hit, now));
  const weightOf = (index: number) => weight[index] ?? 0;
  const byWeight = (a: number, b: number) => weightOf(b) - weightOf(a);
  const score = (indexes: number[]) =>
    indexes.reduce((sum, index) => sum + weightOf(index), 0);
  const byWord = keywordIndex(seed, hits);
  const used = new Set<number>();
  const groups: Group[] = [];
  for (
    let group = bestGroup(byWord, used, score);
    group !== undefined && groups.length < count;
    group = bestGroup(byWord, used, score)
  ) {
    groups.push(group);
    for (const index of group.indexes) {
      used.add(index);
    }
  }
  const singles = hits
    .flatMap((_, index) => (used.has(index) ? [] : [index]))
    .toSorted(byWeight)
    .slice(0, Math.max(0, count - groups.length))
    .map((index): Group => ({ indexes: [index], score: weightOf(index) }));
  return [...groups, ...singles]
    .toSorted((a, b) => b.score - a.score)
    .flatMap(({ indexes, word }, rank) => {
      const sources = indexes
        .toSorted(byWeight)
        .slice(0, DEFAULT_COUNT)
        .flatMap((index) => {
          const hit = hits[index];
          return hit === undefined ? [] : [toSource(hit)];
        });
      const [lead] = sources;
      if (lead === undefined) {
        return [];
      }
      return [
        {
          angle: lead.title,
          idea: clip(word ?? lead.title, 120),
          rank: rank + 1,
          sources,
          why: `${sources.length} ${sources.length === 1 ? "story" : "stories"} this week.`,
        },
      ];
    });
};

const SYSTEM = `You turn this week's news into print-on-demand t-shirt ideas for a merchant's niche. Answer only with JSON.

You get the merchant's seed (a niche, audience or idea) and numbered search results. Give up to the requested number of ideas, best first. Each idea:
- idea: a short name for the tee concept (at most 120 characters).
- angle: what the tee would say or show; a slogan or image the audience would wear. No brand names, logos, celebrity names or quoted lyrics.
- why: one line on why it's current, from the results.
- sources: the numbers of the results it comes from (1 to 5). Use only numbers you were given.

Prefer ideas several results support and recent results over old ones.`;

const rankByModel = async (
  ai: Genkit,
  model: string,
  { count = DEFAULT_COUNT, seed }: TrendSeed,
  hits: SearchHit[]
): Promise<TrendIdea[]> => {
  const reply = await generateObject(ai, {
    model,
    prompt: JSON.stringify({
      count,
      results: hits.map((hit, index) => ({
        date: hit.publishedDate,
        n: index,
        snippet: clip(hit.content, SNIPPET),
        title: hit.title,
      })),
      seed,
    }),
    schema: trendReplySchema,
    system: SYSTEM,
    temperature: 0.4,
  });
  return reply.ideas
    .flatMap(({ sources: cited, ...idea }) => {
      // Only numbers Tavily returned become links; invented ones drop out.
      const sources = [...new Set(cited)].flatMap((index) => {
        const hit = hits[index];
        return hit === undefined ? [] : [toSource(hit)];
      });
      return sources.length === 0 ? [] : [{ ...idea, sources }];
    })
    .slice(0, count)
    .map((idea, index) => ({ ...idea, rank: index + 1 }));
};

const RESULTS_PER_QUERY = 10;

export const createTrendResearch = (
  search: Search,
  ai?: Genkit,
  model: string = models.trends
): TrendResearch => ({
  research: async (input) => {
    const options = {
      maxResults: RESULTS_PER_QUERY,
      timeRange: "week",
      topic: "news",
    } as const;
    const batches = await Promise.all([
      search(`${input.seed} trends`, options),
      search(`${input.seed} t-shirt OR merch OR meme`, options),
    ]);
    const seen = new Set<string>();
    const hits = batches.flat().filter((hit) => {
      if (seen.has(hit.url)) {
        return false;
      }
      seen.add(hit.url);
      return true;
    });
    const rules = () => ({
      ideas: rankByRules(input.seed, hits, input.count),
      ranker: "rules" as const,
    });
    if (ai === undefined || hits.length === 0) {
      return rules();
    }
    try {
      const ideas = await rankByModel(ai, model, input, hits);
      return ideas.length > 0 ? { ideas, ranker: "nemotron" } : rules();
    } catch (error) {
      // The error class only: the seed and the results stay out of the logs.
      console.error(
        "research_trends ranking fell back to rules:",
        error instanceof Error ? error.name : "unknown"
      );
      return rules();
    }
  },
  screen: async (phrase) => {
    const hits = await search(`"${phrase.replaceAll('"', "")}" trademark`, {
      exactMatch: true,
      maxResults: 5,
      topic: "general",
    });
    return hits.map(({ title, url }) => ({ title: clip(title, SNIPPET), url }));
  },
});

// Trend research on Tavily (ranked by Nemotron when there's a Nebius key), or
// undefined without a Tavily key.
export const trendResearchFor = (
  tavilyKey: string | undefined,
  nebiusKey?: string
): TrendResearch | undefined => {
  const search = createSearch(tavilyKey);
  return search === undefined
    ? undefined
    : createTrendResearch(search, createAi(nebiusKey));
};
