import type { TavilySearchOptions, TavilySearchResponse } from "@tavily/core";
import { describe, expect, it, vi } from "vitest";

import { fitOutcomeModel } from "./outcomes";
import type { DesignOutcome } from "./outcomes";
import { createQloo } from "./qloo";
import type { Qloo } from "./qloo";
import { fakeNemotron } from "./test-doubles";
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
// #243: 64 characters, one clause.
const LONG_BRIEF =
  "Cozy botanical tees for houseplant lovers who love Studio Ghibli";
const DARK_BRIEF =
  "Gothic botanical tees for plant lovers who like dark academia";

// What Nemotron copies from the dark-academia brief: three concepts, one
// with two phrases, and a name the brief doesn't hold.
const DARK_CONCEPTS = [
  { name: "Gothic", phrases: ["Gothic"] },
  { name: "botanical", phrases: ["botanical", "plant"] },
  { name: "dark academia", phrases: ["dark academia"] },
  { name: "Studio Ghibli", phrases: ["Studio Ghibli"] },
];

// Qloo's answers for the dark-academia brief, as read live on 2026-10-29
// (trimmed): each concept's tags, the tags each one's fans share, and the
// shared query, which the dark-academia and gothic tags outweigh.
const DARK_TAGS: Record<string, string[]> = {
  botanical: ["urn:tag:keyword:media:botanical_garden"],
  "dark academia": [
    "urn:tag:keyword:media:dark_academia",
    "urn:tag:genre:media:dark",
  ],
  gothic: ["urn:tag:genre:media:gothic", "urn:tag:keyword:media:gothic"],
  plant: ["urn:tag:genre:media:plants"],
};
const tagsNamed = (names: [string, number][]) =>
  names.map(([name, affinity]) => ({
    id: `urn:tag:keyword:media:${name.toLowerCase().replaceAll(" ", "_")}`,
    name,
    query: { affinity },
  }));
const DARK_NEAR: Record<string, [string, number][]> = {
  "urn:tag:genre:media:gothic,urn:tag:keyword:media:gothic": [
    ["The Gothic", 0.974],
    ["Gothic Literature", 0.957],
    ["gothic romance", 0.946],
  ],
  "urn:tag:keyword:media:botanical_garden,urn:tag:genre:media:plants": [
    ["botany", 0.971],
    ["flora", 0.955],
    ["houseplant", 0.915],
  ],
  "urn:tag:keyword:media:dark_academia": [
    ["Dark Academia", 0.961],
    ["Academic", 0.955],
    ["Philosophy", 0.89],
  ],
};
const DARK_SHARED: [string, number][] = [
  ["Academic", 0.95],
  ["Philosophy", 0.94],
  ["Gothic Literature", 0.92],
  ["Dark Academia", 0.91],
  ["gothic romance", 0.9],
];
const qlooDarkBrief = async (url: URL) => {
  const { pathname, searchParams } = url;
  let body: unknown = { results: [] };
  if (pathname === "/v2/tags") {
    const ids =
      DARK_TAGS[searchParams.get("filter.query")?.toLowerCase() ?? ""];
    body = {
      results: { tags: (ids ?? []).map((id) => ({ id, name: id })) },
    };
  } else if (pathname === "/v2/insights") {
    const signal = searchParams.get("signal.interests.tags") ?? "";
    body = {
      results: {
        entities: [],
        tags: tagsNamed(DARK_NEAR[signal] ?? DARK_SHARED),
      },
    };
  }
  return await Promise.resolve(Response.json(body));
};

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

    const research = await trends.research("ghibli");

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

  it("suggests no idea without Qloo affinity", async () => {
    const { client, search } = fakeTavily();
    const qloo = qlooWith(
      async () =>
        await Promise.resolve({
          names: ["Studio Ghibli"],
          themes: [
            { affinity: 0.9, id: "urn:tag:genre:anime", name: "anime" },
            { affinity: 0, id: "urn:tag:style:cozy", name: "cozy" },
          ],
        })
    );

    const research = await createTrends(client, qloo).research("ghibli");

    expect(research.ideas.map((idea) => idea.theme)).toEqual(["anime"]);
    expect(search).toHaveBeenCalledTimes(2);
    expect(research.ideas.every((idea) => idea.signals.affinity > 0)).toBe(
      true
    );
  });

  it("stops with QLOO_NO_MATCH when no Qloo tag has affinity", async () => {
    const { client, search } = fakeTavily();
    const qloo = qlooWith(
      async () =>
        await Promise.resolve({
          names: [],
          themes: [{ affinity: 0, id: "urn:tag:style:cozy", name: "cozy" }],
        })
    );

    await expect(
      createTrends(client, qloo).research("ghibli")
    ).rejects.toMatchObject({ code: "QLOO_NO_MATCH" });
    expect(search).not.toHaveBeenCalled();
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

  // Next, run 8c279e18: "Qloo found no audience for this brief".
  it("searches Qloo for the phrases Nemotron copies from the brief, never one it made up", async () => {
    const { client } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>(
      async () => await Promise.resolve(GHIBLI_TASTE)
    );
    const { ask } = fakeNemotron({ concepts: DARK_CONCEPTS });

    await createTrends(client, qlooWith(tasteOf), ask).research(DARK_BRIEF);

    expect(tasteOf).toHaveBeenCalledWith(DARK_BRIEF, undefined, {
      concepts: [
        { name: "Gothic", phrases: ["Gothic"] },
        { name: "botanical", phrases: ["botanical", "plant"] },
        { name: "dark academia", phrases: ["dark academia"] },
      ],
      crossDomain: true,
      // The brief itself is too long a term for Qloo's /search.
      terms: ["Gothic", "botanical", "plant", "dark academia"],
    });
  });

  // #243: one clause over 60 characters left no search term, and the
  // research ended in "Qloo found no audience".
  it.each([
    ["with the brief's concepts", true],
    ["with its subject words when brief_terms is down", false],
  ])(
    "reaches Qloo for a long brief with no punctuation (%s)",
    async (_, asked) => {
      const searched: string[] = [];
      vi.stubGlobal("fetch", async (url: URL) => {
        const query =
          url.searchParams.get("query") ??
          url.searchParams.get("filter.query") ??
          "";
        if (url.pathname === "/search") {
          searched.push(query);
          return await Promise.resolve(
            Response.json({
              results:
                query === "Studio Ghibli"
                  ? [{ entity_id: "E-GHIBLI", name: "Studio Ghibli" }]
                  : [],
            })
          );
        }
        const botanical =
          query === "botanical"
            ? [{ id: "urn:tag:keyword:media:botanical", name: "Botanical" }]
            : [];
        return await Promise.resolve(
          Response.json({
            results: {
              entities: [],
              tags:
                url.pathname === "/v2/tags"
                  ? botanical
                  : tagsNamed([
                      ["botany", 0.9],
                      ["cottagecore", 0.8],
                    ]),
            },
          })
        );
      });
      const { client } = fakeTavily();
      const ask = asked
        ? fakeNemotron({
            concepts: [
              { name: "cozy", phrases: ["Cozy"] },
              { name: "botanical", phrases: ["botanical", "houseplant"] },
              { name: "Studio Ghibli", phrases: ["Studio Ghibli"] },
            ],
          }).ask
        : undefined;
      const qloo = createQloo({ apiKey: "k", baseURL: "https://qloo.example" });

      const { ideas } = await createTrends(client, qloo, ask).research(
        LONG_BRIEF
      );

      expect(searched.length).toBeGreaterThan(0);
      expect(ideas.length).toBeGreaterThan(0);
      if (asked) {
        expect(searched).toContain("Studio Ghibli");
      }
      vi.unstubAllGlobals();
    }
  );

  // Next, run 783b6885: the ideas were "Academic", "Philosophy" and
  // "Academia", with nothing gothic or botanical.
  it("researches themes that carry at least two of the brief's three concepts", async () => {
    vi.stubGlobal("fetch", qlooDarkBrief);
    const { client } = fakeTavily();
    const { ask } = fakeNemotron({ concepts: DARK_CONCEPTS });
    const qloo = createQloo({ apiKey: "k", baseURL: "https://qloo.example" });

    const { ideas } = await createTrends(client, qloo, ask).research(
      DARK_BRIEF
    );

    expect(ideas).toHaveLength(RUN_THEMES);
    for (const idea of ideas) {
      expect(idea.concepts?.total).toBe(3);
      expect(idea.concepts?.covered.length).toBeGreaterThanOrEqual(2);
    }
    const covered = new Set(ideas.flatMap((idea) => idea.concepts?.covered));
    expect(covered).toStrictEqual(
      new Set(["Gothic", "botanical", "dark academia"])
    );
    expect(ideas.map((idea) => idea.theme)).not.toContain("Academic");
    vi.unstubAllGlobals();
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

// Marketplace proof for "anime" only; "cozy" is crowded with
// near-identical listings; "pastel" has neither.
const gatedTavily = () => {
  const { client } = fakeTavily();
  const search = vi.fn(async (query: string, options?: TavilySearchOptions) => {
    const quoted = /^"(?<theme>[^"]+)" (?<kind>shirt|t-shirt)$/u.exec(query);
    const theme = quoted?.groups?.["theme"] ?? "";
    if (quoted?.groups?.["kind"] === "shirt") {
      return await Promise.resolve(
        reply(
          query,
          theme === "anime"
            ? [
                hit(
                  "https://www.etsy.com/listing/9",
                  `${theme} shirt`,
                  "Bestseller. 1,240 reviews"
                ),
              ]
            : []
        )
      );
    }
    if (quoted?.groups?.["kind"] === "t-shirt") {
      return await Promise.resolve(
        reply(
          query,
          theme.startsWith("cozy")
            ? Array.from({ length: 10 }, (_, index) =>
                hit(
                  `https://www.etsy.com/listing/c${index}`,
                  `${theme} t-shirt ${index}`,
                  `${theme} t-shirt`,
                  { score: 0.9 }
                )
              )
            : []
        )
      );
    }
    return await client.search(query, options);
  });
  return { ...client, search } satisfies TavilyTrends;
};

describe("createTrends with the evidence gate", () => {
  it("shows only proven, unsaturated ideas, ranked by the lower bound", async () => {
    const trends = createTrends(gatedTavily(), qlooGhibli);
    const research = await trends.research("ghibli", undefined, {
      evidenceGate: true,
      tavily: true,
    });
    expect(research.ideas.map((idea) => idea.theme)).toStrictEqual(["anime"]);
    const [top] = research.ideas;
    expect(top?.rank).toBe(1);
    expect(top?.proof).toMatchObject({
      market: { bestsellers: 1, reviews: 1240 },
      proven: true,
      supply: { count: 0 },
    });
    expect(top?.score).toBe(top?.spot?.score);
  });

  // The founder's typed brief on next (2026-10-29): Qloo names the themes and
  // the marketplaces list them, but no listing shows a Bestseller badge or
  // reviews. The gate dropped every theme, research came back empty and the
  // run failed at Trends with "Research found no ideas for this seed".
  it("never fails a typed brief because no theme proved demand", async () => {
    const trends = createTrends(fakeTavily().client, qlooGhibli);
    const research = await trends.research(BRIEF, undefined, {
      evidenceGate: true,
      tavily: true,
    });
    expect(research.ideas.map((idea) => idea.theme)).toStrictEqual([
      "anime",
      "cozy",
      "pastel",
    ]);
    expect(research.ideas.map((idea) => idea.caution)).toStrictEqual([
      "no_demand_proof",
      "no_demand_proof",
      "no_demand_proof",
    ]);
    expect(research.ideas.map((idea) => idea.rank)).toStrictEqual([1, 2, 3]);
  });

  it("calls a failed marketplace read unknown, not unproven", async () => {
    const { client } = fakeTavily();
    const search = vi.fn(
      async (query: string, options?: TavilySearchOptions) => {
        if (options?.includeDomains !== undefined && query.endsWith(" shirt")) {
          throw new Error("Tavily answered 432");
        }
        return await client.search(query, options);
      }
    );
    const trends = createTrends({ ...client, search }, qlooGhibli);
    const research = await trends.research(BRIEF, undefined, {
      evidenceGate: true,
      tavily: true,
    });
    expect(research.ideas.length).toBeGreaterThan(0);
    expect(
      research.ideas.every((idea) => idea.caution === "demand_unknown")
    ).toBe(true);
  });

  it("leaves the old ranking alone with the gate off", async () => {
    const trends = createTrends(gatedTavily(), qlooGhibli);
    const research = await trends.research("ghibli");
    expect(research.ideas).toHaveLength(3);
    expect(research.ideas[0]?.proof).toBeUndefined();
  });
});

// A merchant's record for one theme: `wins` designs that sold, `losses`
// that didn't.
const designsFor = (theme: string, wins: number, losses: number) =>
  Array.from({ length: wins + losses }, (_, index): DesignOutcome => {
    const won = index < wins;
    return {
      addToCarts: 0,
      clicks: 0,
      dropId: `${theme}_${index}`,
      impressions: 0,
      launchedAt: new Date(Date.now() - 10 * DAY_MS),
      productId: `${theme}_${index}`,
      profitPerSaleCents: 1000,
      purchases: 0,
      qlooTags: [theme],
      revenueCents: 0,
      salesCovered: true,
      spendCents: won ? 0 : 500,
      theme,
      units: won ? 3 : 0,
    };
  });

describe("createTrends with the merchant's track record", () => {
  it("reorders the ideas by a strong record and says why", async () => {
    const trends = createTrends(fakeTavily().client, qlooGhibli);
    const plain = await trends.research("ghibli");
    const themes = plain.ideas.map((idea) => idea.theme);
    const first = themes[0] ?? "";
    const last = themes.at(-1) ?? "";
    const research = await trends.research("ghibli", undefined, undefined, {
      outcomes: fitOutcomeModel([
        ...designsFor(last, 12, 0),
        ...designsFor(first, 0, 12),
      ]),
    });
    expect(research.ideas[0]?.theme).toBe(last);
    expect(research.ideas.map((idea) => idea.rank)).toStrictEqual([1, 2, 3]);
    expect(research.ideas[0]?.outcome).toMatchObject({ direction: "up" });
  });

  it("scales the gated score and keeps the sweet spot as read", async () => {
    const trends = createTrends(gatedTavily(), qlooGhibli);
    const research = await trends.research(
      "ghibli",
      undefined,
      { evidenceGate: true, tavily: true },
      { outcomes: fitOutcomeModel(designsFor("anime", 12, 0)) }
    );
    const [top] = research.ideas;
    expect(top?.score).toBeGreaterThan(top?.spot?.score ?? 0);
  });

  it("leaves the ranking unchanged with no data", async () => {
    const trends = createTrends(fakeTavily().client, qlooGhibli);
    const plain = await trends.research("ghibli");
    const empty = await trends.research("ghibli", undefined, undefined, {
      outcomes: fitOutcomeModel([]),
    });
    expect(empty.ideas.map((idea) => idea.theme)).toStrictEqual(
      plain.ideas.map((idea) => idea.theme)
    );
    expect(empty.ideas.map((idea) => idea.score)).toStrictEqual(
      plain.ideas.map((idea) => idea.score)
    );
    expect(empty.ideas.every((idea) => idea.outcome === undefined)).toBe(true);
  });
});
