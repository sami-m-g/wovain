import { z } from "zod";

import { external, notConfigured } from "./log";
import type { Logger } from "./log";
import type { QlooConfig } from "./qloo";
import type { TraceSource } from "./trace";
import { MIN_RELEVANCE, rankSources } from "./trends";
import type { TavilySearch } from "./trends";

// Autopilot's triggers (openspec autopilot-triggers): what changed this week
// that fits a brand. Qloo names the brands rising with the brand's audience
// (`bias.trends` on /v2/insights); Tavily says whether the news is talking
// about them, or about the brand's niches, this week. A query with recent,
// relevant news is a match; the rest is code, so a rationale never says
// more than the data does. Everything Qloo and Tavily return is untrusted
// data: it is filtered, clipped and never followed.

const QLOO_TIMEOUT_MS = 15_000;
const TAVILY_TIMEOUT_S = 20;
// Qloo affinity (0..1) a rising entity needs to count for the brand.
export const MIN_AFFINITY = 0.5;
// News older than this is not this week's.
export const NEWS_MAX_AGE_DAYS = 7;
// Searches per scan: the top rising names and the first niches.
export const RISING_SEARCHED = 2;
export const NICHES_SEARCHED = 2;
// Suggestions one scan may save.
export const MAX_MATCHES = 2;
// Signal entities sent to Qloo.
const MAX_SIGNAL_ENTITIES = 10;
const NEWS_RESULTS = 5;
const NEWS_KEPT = 3;
const TITLE_MAX = 160;
const SEED_MAX = 200;

const insightsSchema = z.object({
  results: z.object({
    entities: z
      .array(
        z.object({
          entity_id: z.string().max(128),
          name: z.string().max(300),
          popularity: z.number().optional(),
          query: z.object({ affinity: z.number().optional() }).optional(),
        })
      )
      .default([]),
  }),
});

export interface RisingEntity {
  // Qloo's affinity of the entity with the brand's audience, 0..1.
  affinity: number;
  id: string;
  name: string;
}

export interface NewsHit {
  publishedDate?: string | undefined;
  // Tavily's relevance, 0..1.
  score: number;
  title: string;
  url: string;
}

export type SignalTrigger = "qloo" | "trend";

export interface SignalQuery {
  // The rising entity behind a Qloo-led query.
  entity?: RisingEntity | undefined;
  query: string;
  // What the suggestion is about: the entity's name or the niche.
  subject: string;
  trigger: SignalTrigger;
}

export interface SignalMatch {
  entity?: RisingEntity | undefined;
  // The dedup key: a subject is suggested at most once a week.
  key: string;
  news: NewsHit[];
  rationale: string;
  score: number;
  // The run's seed if the merchant (or autopilot) starts it.
  seed: string;
  sources: TraceSource[];
  subject: string;
  title: string;
  trigger: SignalTrigger;
}

export interface BrandSignalsInput {
  niches: string[];
  qlooEntities: { id: string; name: string }[];
}

const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const subjectKey = (trigger: SignalTrigger, subject: string) =>
  `${trigger}:${normalized(subject)}`;

// The queries one scan searches: the brand's top rising entities that it
// doesn't already name, then its first niches.
export const queriesFor = (
  brand: BrandSignalsInput,
  rising: RisingEntity[]
): SignalQuery[] => {
  const own = new Set(
    brand.qlooEntities.flatMap(({ id, name }) => [id, normalized(name)])
  );
  const niches = brand.niches
    .map((niche) => niche.trim())
    .filter((niche) => niche !== "");
  const [lead] = niches;
  const fromQloo = rising
    .filter(
      (entity) =>
        entity.affinity >= MIN_AFFINITY &&
        !own.has(entity.id) &&
        !own.has(normalized(entity.name))
    )
    .toSorted((a, b) => b.affinity - a.affinity)
    .slice(0, RISING_SEARCHED)
    .map((entity) => ({
      entity,
      query: `${entity.name} ${lead ?? "fashion"}`,
      subject: entity.name,
      trigger: "qloo" as const,
    }));
  const fromNiches = niches.slice(0, NICHES_SEARCHED).map((niche) => ({
    query: `${niche} fashion trend`,
    subject: niche,
    trigger: "trend" as const,
  }));
  return [...fromQloo, ...fromNiches];
};

const PERCENT = 100;

const seedOf = (query: SignalQuery, niches: string[]) => {
  const [lead] = niches;
  // A brand name is never the seed alone: research then treats it as a
  // name to keep off the product, not as the merchant's own subject.
  const seed =
    query.trigger === "qloo"
      ? `${lead ?? "streetwear"} looks for fans of ${query.subject}`
      : query.subject;
  return clip(seed, SEED_MAX);
};

const rationaleOf = (query: SignalQuery, news: NewsHit[]) => {
  const [top] = news;
  const headline = top === undefined ? "" : ` Top story: "${top.title}".`;
  const stories =
    news.length === 1 ? "1 news story" : `${news.length} news stories`;
  if (query.entity !== undefined) {
    const affinity = Math.round(query.entity.affinity * PERCENT);
    return `${query.subject} is rising with your audience on Qloo (${affinity}% affinity), and ${stories} this week mention it.${headline}`;
  }
  return `${stories} this week on ${query.subject}, one of your niches.${headline}`;
};

// A query becomes a match when its news held up.
export const matchOf = (
  query: SignalQuery,
  news: NewsHit[],
  niches: string[]
): SignalMatch | undefined => {
  const [top] = news;
  if (top === undefined) {
    return undefined;
  }
  const kept = news.slice(0, NEWS_KEPT);
  const sources: TraceSource[] = [
    ...(query.entity === undefined
      ? []
      : [
          {
            id: query.entity.id,
            provider: "qloo" as const,
            title: query.entity.name,
          },
        ]),
    ...kept.map(({ title, url }) => ({
      provider: "tavily" as const,
      title,
      url,
    })),
  ];
  return {
    entity: query.entity,
    key: subjectKey(query.trigger, query.subject),
    news: kept,
    rationale: rationaleOf(query, kept),
    score: top.score * (query.entity?.affinity ?? 1),
    seed: seedOf(query, niches),
    sources,
    subject: query.subject,
    title: clip(`A drop on ${query.subject}`, TITLE_MAX),
    trigger: query.trigger,
  };
};

// The suggestions one scan saves: new subjects only, best first.
export const pickMatches = (
  matches: SignalMatch[],
  seen: ReadonlySet<string>,
  max = MAX_MATCHES
) => {
  const keys = new Set(seen);
  return matches
    .toSorted((a, b) => b.score - a.score)
    .filter((match) => {
      const fresh = !keys.has(match.key);
      keys.add(match.key);
      return fresh;
    })
    .slice(0, max);
};

export const createSignals = ({
  qloo,
  tavily,
}: {
  qloo: QlooConfig;
  tavily: TavilySearch;
}) => {
  // Brands rising with the audience of these Qloo entities.
  const rising = async (
    entityIds: string[],
    log?: Logger
  ): Promise<RisingEntity[]> => {
    if (entityIds.length === 0) {
      return [];
    }
    return await external(
      log,
      { operation: "rising", provider: "qloo" },
      async () => {
        if (qloo.apiKey === undefined) {
          throw notConfigured.qloo();
        }
        const query = new URLSearchParams({
          "bias.trends": "high",
          "filter.type": "urn:entity:brand",
          "signal.interests.entities": entityIds
            .slice(0, MAX_SIGNAL_ENTITIES)
            .join(","),
          take: "10",
        });
        // Qloo's configured base URL and a literal path; the query is
        // encoded, so no input picks the host.
        // nosemgrep
        const response = await fetch(
          new URL(`/v2/insights?${query}`, qloo.baseURL),
          {
            headers: { Accept: "application/json", "X-Api-Key": qloo.apiKey },
            signal: AbortSignal.timeout(QLOO_TIMEOUT_MS),
          }
        );
        if (!response.ok) {
          throw new Error(`Qloo /v2/insights answered ${response.status}`);
        }
        const { results } = insightsSchema.parse(await response.json());
        return results.entities.map((entity) => ({
          affinity: entity.query?.affinity ?? entity.popularity ?? 0,
          id: entity.entity_id,
          name: clip(entity.name.trim(), TITLE_MAX),
        }));
      }
    );
  };

  // This week's news on a query, filtered to what can stand as evidence.
  const news = async (
    query: string,
    log?: Logger,
    now = Date.now()
  ): Promise<NewsHit[]> =>
    await external(log, { operation: "news", provider: "tavily" }, async () => {
      const reply = await tavily.search(query, {
        maxResults: NEWS_RESULTS,
        searchDepth: "basic",
        timeRange: "week",
        timeout: TAVILY_TIMEOUT_S,
        topic: "news",
      });
      return rankSources(
        reply.results,
        query,
        { maxAgeDays: NEWS_MAX_AGE_DAYS, minScore: MIN_RELEVANCE },
        now
      ).map(({ publishedDate, score, title, url }) => ({
        publishedDate,
        score,
        title: clip(title, TITLE_MAX),
        url,
      }));
    });

  return { news, rising };
};

export type Signals = ReturnType<typeof createSignals>;
