import type { TavilySearchOptions, TavilySearchResponse } from "@tavily/core";
import { describe, expect, it, vi } from "vitest";

import type { Qloo } from "./qloo";
import { RUN_THEMES } from "./themes";
import { createTrends, MAX_NEWS_AGE_DAYS, rankSources } from "./trends";
import type { TavilyTrends } from "./trends";

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
  // Extract reads one listing at $26 and can't reach the other.
  const extract = vi.fn(
    async (urls: string[]) =>
      await Promise.resolve({
        failedResults: urls
          .slice(1)
          .map((url) => ({ error: "Failed to fetch", url })),
        requestId: "e1",
        responseTime: 0.1,
        results: urls.slice(0, 1).map((url) => ({
          rawContent: "Classic T-Shirt $26.00",
          title: "Listing",
          url,
        })),
      })
  );
  return {
    client: { extract, search } satisfies TavilyTrends,
    extract,
    search,
  };
};

const qlooWith = (tasteOf: Qloo["tasteOf"]): Pick<Qloo, "tasteOf"> => ({
  tasteOf,
});
const qlooDown = qlooWith(
  async () => await Promise.reject(new Error("Qloo is down"))
);
const qlooBlank = qlooWith(
  async () => await Promise.resolve({ names: [], themes: [] })
);

const BRIEF = "Spooky Halloween tees for horror movie fans";

// What Qloo answers for Studio Ghibli: three taste tags.
const GHIBLI_TASTE = {
  names: ["Studio Ghibli"],
  themes: [
    { affinity: 0.9, id: "urn:tag:genre:anime", name: "anime" },
    { affinity: 0.2, id: "urn:tag:style:cozy", name: "cozy" },
    { affinity: 0.1, id: "urn:tag:style:pastel", name: "pastel" },
  ],
};
const qlooGhibli = qlooWith(async () => await Promise.resolve(GHIBLI_TASTE));

describe("createTrends", () => {
  it("searches each Qloo theme on Tavily and ranks the ideas", async () => {
    const { client, search } = fakeTavily();
    const trends = createTrends(client, qlooGhibli);

    const research = await trends.research("ghibli");

    expect(search).toHaveBeenCalledTimes(6);
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

  it("makes every idea a Qloo tag", async () => {
    const { client } = fakeTavily();

    const research = await createTrends(client, qlooGhibli).research("ghibli");

    const tags = new Set(GHIBLI_TASTE.themes.map(({ id }) => id));
    expect(research.ideas.length).toBeGreaterThan(0);
    expect(research.ideas.every((idea) => tags.has(idea.qlooTag ?? ""))).toBe(
      true
    );
  });

  it("puts Qloo's taste map on each idea when asked", async () => {
    const { client } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>(
      async () =>
        await Promise.resolve({
          affinities: [
            {
              affinity: 0.9,
              because: [{ id: "E1", name: "Studio Ghibli", share: 1 }],
              cues: ["Minimalist"],
              id: "B1",
              name: "Zozotown",
              type: "brand",
            },
          ],
          failedDomains: ["movie"],
          names: ["Studio Ghibli", "Zozotown"],
          seeds: [{ id: "E1", name: "Studio Ghibli", type: "artist" }],
          themes: GHIBLI_TASTE.themes,
        })
    );
    const trends = createTrends(client, qlooWith(tasteOf));

    const research = await trends.research("ghibli", undefined, {
      tasteMap: true,
      tavily: true,
    });

    expect(tasteOf).toHaveBeenCalledWith("ghibli", undefined, {
      crossDomain: true,
    });
    const anime = research.ideas.find((idea) => idea.theme === "anime");
    expect(anime?.taste).toEqual({
      affinities: [expect.objectContaining({ name: "Zozotown" })],
      // The film call failed: the panel says so.
      failedDomains: ["movie"],
      seeds: [{ id: "E1", name: "Studio Ghibli", type: "artist" }],
      tag: { affinity: 0.9, id: "urn:tag:genre:anime", name: "anime" },
    });
  });

  it("leaves the taste map out unless asked", async () => {
    const { client } = fakeTavily();

    const research = await createTrends(client, qlooGhibli).research("ghibli");

    expect(research.ideas.every((idea) => idea.taste === undefined)).toBe(true);
  });

  it("stops with QLOO_NO_MATCH, and searches nothing, when Qloo matches nothing", async () => {
    const { client, search } = fakeTavily();
    const set = vi.fn();

    const failure = createTrends(client, qlooBlank).research(BRIEF, { set });

    await expect(failure).rejects.toMatchObject({
      code: "QLOO_NO_MATCH",
      message:
        "Qloo found no audience for this brief; try naming a band, film, brand or place",
      status: 422,
    });
    expect(search).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ trends: { qloo: "no_match" } });
  });

  it("stops when Qloo's only tag is the brief itself", async () => {
    const { client, search } = fakeTavily();
    const echo = qlooWith(
      async () =>
        await Promise.resolve({
          names: [],
          themes: [{ affinity: 0.6, id: "urn:tag:genre:x", name: BRIEF }],
        })
    );

    await expect(
      createTrends(client, echo).research(BRIEF)
    ).rejects.toMatchObject({ status: 422 });
    expect(search).not.toHaveBeenCalled();
  });

  it("fails when Qloo fails, and never researches without it", async () => {
    const { client, search } = fakeTavily();

    await expect(
      createTrends(client, qlooDown).research(BRIEF)
    ).rejects.toThrow("Qloo is down");
    // Tavily can't name ideas on its own.
    expect(search).not.toHaveBeenCalled();
  });

  it("researches only Qloo's few themes, with no top-up from the brief", async () => {
    const { client } = fakeTavily();
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
      )
    );

    const research = await trends.research(BRIEF);

    expect(research.ideas.map((idea) => idea.theme)).toEqual(["Horror"]);
  });

  it("caps a run at RUN_THEMES of Qloo's themes", async () => {
    const { client } = fakeTavily();
    const many = qlooWith(
      async () =>
        await Promise.resolve({
          names: [],
          themes: ["anime", "cozy", "pastel", "folk", "retro"].map(
            (name, index) => ({
              affinity: 1 - index / 10,
              id: `urn:tag:style:${name}`,
              name,
            })
          ),
        })
    );

    const research = await createTrends(client, many).research("ghibli");

    expect(research.ideas).toHaveLength(RUN_THEMES);
  });

  // #64: weak or off-topic sources.
  it("asks Tavily for recent, reranked news", async () => {
    const { client, search } = fakeTavily();
    const trends = createTrends(client, qlooGhibli);

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

  it("searches each Qloo theme with the brief's subject, never the whole brief", async () => {
    const { client, search } = fakeTavily();
    const horror = qlooWith(
      async () =>
        await Promise.resolve({
          names: [],
          themes: [
            { affinity: 0.7, id: "urn:tag:genre:horror", name: "Horror" },
          ],
        })
    );

    await createTrends(client, horror).research(BRIEF);

    const queries = search.mock.calls.map(([query]) => query);
    expect(queries).not.toContain(BRIEF);
    expect(queries).toContain("Horror spooky halloween horror movie");
  });

  it("keeps a theme whose marketplace search failed, and logs the failure", async () => {
    const { client, search } = fakeTavily();
    search.mockImplementation(async (query, options) => {
      if (options?.topic !== "news") {
        throw new Error("Tavily 432: plan limit");
      }
      return await Promise.resolve(
        reply(query, [hit(`https://news.example/${query}`, `${query} news`)])
      );
    });
    const error = vi.fn();
    const trends = createTrends(client, qlooGhibli);

    const research = await trends.research("pickleball", {
      error,
      set: vi.fn(),
    });

    expect(research.ideas.length).toBeGreaterThan(0);
    expect(research.ideas[0]?.failedSearches).toEqual(["market"]);
    expect(research.ideas[0]?.signals.marketHits).toBe(0);
    // One per failed marketplace search.
    expect(error.mock.calls.length).toBeGreaterThanOrEqual(
      research.ideas.length
    );
  });

  it("fails the step when every search fails", async () => {
    const { client, search } = fakeTavily();
    search.mockRejectedValue(new Error("Tavily is down"));
    const trends = createTrends(client, qlooGhibli);

    await expect(trends.research("pickleball")).rejects.toThrow(
      "Tavily is down"
    );
  });

  it("prices the margin from the listings Extract read when evidence is on", async () => {
    const { client, extract } = fakeTavily();
    const trends = createTrends(client, qlooGhibli);

    const research = await trends.research("pickleball", undefined, {
      evidence: true,
      tavily: true,
    });

    expect(extract).toHaveBeenCalled();
    const [idea] = research.ideas;
    expect(idea?.prices).toMatchObject({
      count: 1,
      median: 26,
      source: "extract",
    });
    expect(idea?.prices?.citations[0]?.url).toBe(
      "https://www.etsy.com/listing/1"
    );
  });

  it("leaves Extract alone when evidence is off", async () => {
    const { client, extract } = fakeTavily();
    const trends = createTrends(client, qlooGhibli);

    const research = await trends.research("pickleball");

    expect(extract).not.toHaveBeenCalled();
    expect(research.ideas[0]?.prices).toBeUndefined();
  });

  it("returns no ideas and calls nothing when trends-tavily is off", async () => {
    const { client, search } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>();
    const trends = createTrends(client, qlooWith(tasteOf));

    const research = await trends.research("pickleball", undefined, {
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
