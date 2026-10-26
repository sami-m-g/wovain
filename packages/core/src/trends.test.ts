import type { TavilySearchOptions, TavilySearchResponse } from "@tavily/core";
import { describe, expect, it, vi } from "vitest";

import type { Nemotron } from "./nemotron";
import type { Qloo } from "./qloo";
import { fakeNemotron } from "./test-doubles";
import { MIN_THEMES } from "./themes";
import { createTrends, MAX_NEWS_AGE_DAYS, rankSources } from "./trends";
import type { TavilySearch } from "./trends";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-10-26T20:10:00Z");
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();
const now = new Date().toISOString();

const hit = (
  url: string,
  title: string,
  content = "",
  { publishedDate = now, score = 0.8 } = {}
) => ({ content, id: url, publishedDate, score, title, url });

const reply = (
  query: string,
  results: ReturnType<typeof hit>[]
): TavilySearchResponse => ({
  answer: `Why ${query} matters`,
  images: [
    { url: "https://images.example/ref.png" },
    { url: "data:image/png;base64,AAAA" },
  ],
  query,
  requestId: "r1",
  responseTime: 0.1,
  results,
});

// News for every query; the marketplace search finds two priced listings.
const fakeTavily = () => {
  const search = vi.fn(
    async (query: string, options?: TavilySearchOptions) =>
      await Promise.resolve(
        options?.topic === "news"
          ? reply(query, [
              hit(
                `https://news.example/${encodeURIComponent(query)}`,
                `${query} is trending`
              ),
              hit("ftp://bad.example/x", "not a web page"),
            ])
          : reply(query, [
              hit(
                "https://www.etsy.com/listing/1",
                `${query} Tee`,
                "Price $30.00"
              ),
              hit(
                "https://www.etsy.com/listing/2",
                `${query} Shirt`,
                "$34.00 now"
              ),
            ])
      )
  );
  return { client: { search } satisfies TavilySearch, search };
};

const qlooWith = (tasteOf: Qloo["tasteOf"]): Qloo => ({ tasteOf });
const qlooDown = qlooWith(
  async () => await Promise.reject(new Error("Qloo is down"))
);

const timedOut: Nemotron = async () =>
  await Promise.reject(new Error("Nemotron timed out"));

const BRIEF = "Spooky Halloween tees for horror movie fans";

// What Nemotron answers for the Halloween brief: one theme echoes the
// brief and one repeats another, so code must drop both.
const HALLOWEEN_THEMES = {
  themes: [
    { name: "Retro slasher VHS covers", query: "retro slasher VHS nostalgia" },
    { name: BRIEF, query: BRIEF },
    { name: "Cozy witch cottagecore", query: "cottagecore witch aesthetic" },
    { name: "VHS covers, retro slasher", query: "slasher VHS covers" },
    { name: "Haunted house humor", query: "haunted house memes Halloween" },
    { name: "Day of the Dead skulls", query: "Dia de los Muertos skull art" },
  ],
};

describe("createTrends", () => {
  it("searches each Qloo theme on Tavily and ranks the ideas", async () => {
    const { client, search } = fakeTavily();
    const { ask, asked } = fakeNemotron(HALLOWEEN_THEMES);
    const trends = createTrends(
      client,
      qlooWith(
        async () =>
          await Promise.resolve({
            names: ["Studio Ghibli"],
            themes: [
              { affinity: 0.9, id: "urn:tag:genre:anime", name: "anime" },
              { affinity: 0.2, id: "urn:tag:style:cozy", name: "cozy" },
              { affinity: 0.1, id: "urn:tag:style:pastel", name: "pastel" },
            ],
          })
      ),
      ask
    );

    const research = await trends.research("ghibli");

    // Qloo named enough themes: no model call.
    expect(asked).toEqual([]);
    expect(search).toHaveBeenCalledTimes(6);
    expect(research.qloo).toBe("used");
    expect(research.avoidNames).toEqual(["Studio Ghibli"]);
    expect(research.ideas.map((idea) => idea.rank)).toEqual([1, 2, 3]);
    expect(research.ideas[0]?.theme).toBe("anime");
    const [top] = research.ideas;
    expect(top?.qlooTag).toBe("urn:tag:genre:anime");
    expect(
      top?.sources.every((source) => source.url.startsWith("https://"))
    ).toBe(true);
    expect(top?.references).toEqual(["https://images.example/ref.png"]);
    expect(top?.signals.marketHits).toBe(2);
  });

  // #62: one idea whose title echoed the brief.
  it("splits a brief into 3 to 5 distinct themes when Qloo fails", async () => {
    const { client, search } = fakeTavily();
    const { ask, asked } = fakeNemotron(HALLOWEEN_THEMES);
    const trends = createTrends(client, qlooDown, ask);

    const research = await trends.research(BRIEF);

    expect(research.qloo).toBe("failed");
    expect(asked).toEqual(["research_themes"]);
    const themes = research.ideas.map((idea) => idea.theme);
    expect(themes).toHaveLength(4);
    expect(themes).not.toContain(BRIEF);
    expect(new Set(themes).size).toBe(themes.length);
    expect(themes).not.toContain("VHS covers, retro slasher");
    // Tavily searches the theme's query, never the whole brief.
    const queries = search.mock.calls.map(([query]) => query);
    expect(queries).not.toContain(BRIEF);
    expect(queries).toContain("retro slasher VHS nostalgia");
  });

  it("tops up Qloo's few themes from the brief", async () => {
    const { client } = fakeTavily();
    const { ask } = fakeNemotron(HALLOWEEN_THEMES);
    const trends = createTrends(
      client,
      qlooWith(
        async () =>
          await Promise.resolve({
            names: [],
            themes: [
              { affinity: 0.7, id: "urn:tag:genre:horror", name: "Horror" },
              // Qloo's own echo of the brief is not a theme.
              { affinity: 0.6, id: "urn:tag:genre:x", name: BRIEF },
            ],
          })
      ),
      ask
    );

    const research = await trends.research(BRIEF);
    const themes = research.ideas.map((idea) => idea.theme);

    expect(themes).toContain("Horror");
    expect(themes).not.toContain(BRIEF);
    expect(themes.length).toBeGreaterThanOrEqual(MIN_THEMES);
    expect(themes.length).toBeLessThanOrEqual(5);
  });

  it("falls back to design angles, not the brief, without a model", async () => {
    const { client, search } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>();
    const trends = createTrends(client, qlooWith(tasteOf));

    const research = await trends.research(BRIEF, undefined, {
      qloo: false,
      tavily: true,
    });

    expect(tasteOf).not.toHaveBeenCalled();
    expect(research.qloo).toBe("off");
    expect(search).toHaveBeenCalledTimes(6);
    const themes = research.ideas.map((idea) => idea.theme);
    expect(themes).toHaveLength(MIN_THEMES);
    expect(themes).not.toContain(BRIEF);
    expect(themes.every((theme) => theme.includes("Halloween"))).toBe(true);
  });

  it("keeps the run going with design angles when the model fails", async () => {
    const { client } = fakeTavily();
    const set = vi.fn();
    const trends = createTrends(client, qlooDown, timedOut);

    const research = await trends.research("pickleball", { set });

    expect(research.ideas.map((idea) => idea.theme).toSorted()).toEqual([
      "Funny Pickleball",
      "Minimalist Pickleball",
      "Retro Pickleball",
    ]);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        themes: expect.objectContaining({ reason: "Nemotron timed out" }),
      })
    );
  });

  it("accepts a long theme name from the model", async () => {
    const { client } = fakeTavily();
    const long = `Retro slasher ${"VHS ".repeat(60)}covers`;
    const { ask } = fakeNemotron({
      themes: [
        { name: long, query: "retro slasher VHS" },
        { name: "Cozy witch", query: "cottagecore witch" },
        { name: "Haunted humor", query: "haunted house memes" },
      ],
    });
    const trends = createTrends(client, qlooDown, ask);

    const research = await trends.research(BRIEF);

    expect(research.ideas).toHaveLength(3);
    expect(
      research.ideas.every((idea) => idea.theme.length <= 120)
    ).toBeTruthy();
  });

  // #64: weak or off-topic sources.
  it("asks Tavily for recent, reranked news", async () => {
    const { client, search } = fakeTavily();
    const trends = createTrends(client, qlooDown);

    await trends.research("pickleball");

    const news = search.mock.calls.find(
      ([, options]) => options?.topic === "news"
    );
    expect(news?.[1]).toMatchObject({
      searchDepth: "advanced",
      timeRange: "month",
      topic: "news",
    });
  });

  it("returns no ideas and calls nothing when trends-tavily is off", async () => {
    const { client, search } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>();
    const trends = createTrends(client, qlooWith(tasteOf));

    const research = await trends.research("pickleball", undefined, {
      qloo: true,
      tavily: false,
    });

    expect(search).not.toHaveBeenCalled();
    expect(tasteOf).not.toHaveBeenCalled();
    expect(research.ideas).toEqual([]);
  });
});

describe("rankSources", () => {
  const news = { maxAgeDays: MAX_NEWS_AGE_DAYS, minScore: 0.4 };
  const query = "retro slasher VHS nostalgia";

  it("drops archive pages, stale, off-topic and low-relevance results", () => {
    const kept = rankSources(
      [
        hit(
          "https://www.slashfilm.com/2011/03/",
          "Archive for March 2011 – SlashFilm",
          "Slasher news",
          { publishedDate: daysAgo(2) }
        ),
        hit("https://site.example/tag/vhs/", "VHS", "slasher", {
          publishedDate: daysAgo(1),
        }),
        hit("https://old.example/a", "Slasher VHS revival", "", {
          publishedDate: daysAgo(400),
        }),
        hit("https://off.example/a", "Stock market today", "Dow rises", {
          publishedDate: daysAgo(1),
        }),
        hit("https://weak.example/a", "Slasher VHS tapes", "", {
          publishedDate: daysAgo(1),
          score: 0.1,
        }),
        hit("https://good.example/a", "Slasher VHS box art is back", "", {
          publishedDate: daysAgo(1),
        }),
      ],
      query,
      news,
      NOW
    );

    expect(kept.map(({ url }) => url)).toEqual(["https://good.example/a"]);
  });

  it("dedupes pages and headlines and ranks fresh, relevant ones first", () => {
    const kept = rankSources(
      [
        hit("https://a.example/story", "Retro VHS horror", "", {
          publishedDate: daysAgo(20),
          score: 0.7,
        }),
        hit("https://www.b.example/story/?utm=x", "Slasher fans", "", {
          publishedDate: daysAgo(1),
          score: 0.7,
        }),
        hit("https://b.example/story", "Slasher fans again", "", {
          publishedDate: daysAgo(1),
          score: 0.6,
        }),
        hit("https://c.example/other", "Retro VHS horror", "", {
          publishedDate: daysAgo(3),
          score: 0.5,
        }),
      ],
      query,
      news,
      NOW
    );

    expect(kept.map(({ url }) => url)).toEqual([
      "https://www.b.example/story/?utm=x",
      "https://c.example/other",
    ]);
  });
});
