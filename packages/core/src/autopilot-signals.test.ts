import type { TavilySearchResponse } from "@tavily/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSignals,
  matchOf,
  MIN_AFFINITY,
  pickMatches,
  queriesFor,
  subjectKey,
} from "./autopilot-signals";
import type { SignalMatch } from "./autopilot-signals";
import type { TavilySearch } from "./trends";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

const matchFor = (key: string, score: number) =>
  ({ key, score }) as unknown as SignalMatch;

const tavilyReply = (results: TavilySearchResponse["results"]) =>
  ({
    answer: undefined,
    images: [],
    query: "q",
    requestId: "r",
    responseTime: 0.1,
    results,
  }) as unknown as TavilySearchResponse;

const brand = {
  niches: ["y2k racing", "cottagecore", "gorpcore"],
  qlooEntities: [{ id: "q-own", name: "Own Brand" }],
};

describe("queriesFor", () => {
  it("searches the top rising entities the brand doesn't name, then two niches", () => {
    const queries = queriesFor(brand, [
      { affinity: 0.6, id: "q-a", name: "Arcteryx" },
      { affinity: 0.9, id: "q-b", name: "Salomon" },
      { affinity: 0.95, id: "q-own", name: "Own Brand" },
      { affinity: MIN_AFFINITY - 0.1, id: "q-c", name: "Weak" },
      { affinity: 0.7, id: "q-d", name: "Carhartt" },
    ]);
    expect(queries.map(({ query, trigger }) => [trigger, query])).toEqual([
      ["qloo", "Salomon y2k racing"],
      ["qloo", "Carhartt y2k racing"],
      ["trend", "y2k racing fashion trend"],
      ["trend", "cottagecore fashion trend"],
    ]);
  });

  it("has only niche queries without Qloo entities", () => {
    expect(
      queriesFor({ niches: [" ", "gorpcore"], qlooEntities: [] }, [])
    ).toEqual([
      {
        query: "gorpcore fashion trend",
        subject: "gorpcore",
        trigger: "trend",
      },
    ]);
  });
});

describe("matchOf", () => {
  const entity = { affinity: 0.82, id: "q-b", name: "Salomon" };
  const news = [
    {
      score: 0.9,
      title: "Salomon sneakers sell out",
      url: "https://a.example/1",
    },
    { score: 0.6, title: "Trail shoes go urban", url: "https://b.example/2" },
  ];

  it("is nothing without news", () => {
    expect(
      matchOf({ query: "x", subject: "x", trigger: "trend" }, [], [])
    ).toBeUndefined();
  });

  it("states the Qloo affinity and the news, with both as sources", () => {
    const match = matchOf(
      {
        entity,
        query: "Salomon gorpcore",
        subject: "Salomon",
        trigger: "qloo",
      },
      news,
      ["gorpcore"]
    );
    expect(match).toMatchObject({
      key: "qloo:salomon",
      rationale:
        'Salomon is rising with your audience on Qloo (82% affinity), and 2 news stories this week mention it. Top story: "Salomon sneakers sell out".',
      score: 0.9 * 0.82,
      seed: "gorpcore looks for fans of Salomon",
      title: "A drop on Salomon",
    });
    expect(match?.sources).toEqual([
      { id: "q-b", provider: "qloo", title: "Salomon" },
      { provider: "tavily", title: news[0]?.title, url: news[0]?.url },
      { provider: "tavily", title: news[1]?.title, url: news[1]?.url },
    ]);
  });

  it("seeds a niche match with the niche", () => {
    const [first] = news;
    const match = matchOf(
      { query: "q", subject: "cottagecore", trigger: "trend" },
      first === undefined ? [] : [first],
      []
    );
    expect(match?.seed).toBe("cottagecore");
    expect(match?.rationale).toContain("1 news story this week on cottagecore");
  });
});

describe("pickMatches", () => {
  it("keeps new subjects, best first, at most two", () => {
    const picked = pickMatches(
      [
        matchFor("a", 0.2),
        matchFor("b", 0.9),
        matchFor("c", 0.5),
        matchFor("b", 0.3),
      ],
      new Set(["c"])
    );
    expect(picked.map(({ key }) => key)).toEqual(["b", "a"]);
  });

  it("normalizes subjects in keys", () => {
    expect(subjectKey("trend", "  Y2K-Racing! ")).toBe("trend:y2k racing");
  });
});

describe("createSignals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks Qloo for brands rising with the audience, with bias.trends", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          results: {
            entities: [
              { entity_id: "e1", name: " Salomon ", query: { affinity: 0.8 } },
              { entity_id: "e2", name: "Arcteryx", popularity: 0.4 },
            ],
          },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const signals = createSignals({
      qloo: { apiKey: "k", baseURL: "https://qloo.example" },
      tavily: { search: vi.fn() } as unknown as TavilySearch,
    });
    await expect(signals.rising(["a", "b"])).resolves.toEqual([
      { affinity: 0.8, id: "e1", name: "Salomon" },
      { affinity: 0.4, id: "e2", name: "Arcteryx" },
    ]);
    const [[url]] = fetchMock.mock.calls as unknown as [[URL]];
    expect(url.pathname).toBe("/v2/insights");
    expect(url.searchParams.get("bias.trends")).toBe("high");
    expect(url.searchParams.get("filter.type")).toBe("urn:entity:brand");
    expect(url.searchParams.get("signal.interests.entities")).toBe("a,b");
  });

  it("skips Qloo without entities and fails loudly without a key", async () => {
    const signals = createSignals({
      qloo: { apiKey: undefined, baseURL: "https://qloo.example" },
      tavily: { search: vi.fn() } as unknown as TavilySearch,
    });
    await expect(signals.rising([])).resolves.toEqual([]);
    await expect(signals.rising(["a"])).rejects.toThrow(/qloo/u);
  });

  it("keeps only this week's relevant news", async () => {
    const search = vi.fn(() =>
      Promise.resolve(
        tavilyReply([
          {
            content: "gorpcore jackets everywhere",
            publishedDate: daysAgo(2),
            score: 0.8,
            title: "Gorpcore is back",
            url: "https://news.example/gorp",
          },
          {
            content: "gorpcore",
            publishedDate: daysAgo(20),
            score: 0.9,
            title: "Old gorpcore story",
            url: "https://news.example/old",
          },
          {
            content: "gorpcore",
            publishedDate: daysAgo(1),
            score: 0.1,
            title: "Barely gorpcore",
            url: "https://news.example/weak",
          },
        ] as TavilySearchResponse["results"])
      )
    );
    const signals = createSignals({
      qloo: { apiKey: "k", baseURL: "https://qloo.example" },
      tavily: { search } as unknown as TavilySearch,
    });
    const hits = await signals.news("gorpcore fashion trend", undefined, NOW);
    expect(hits.map(({ url }) => url)).toEqual(["https://news.example/gorp"]);
    expect(search).toHaveBeenCalledWith(
      "gorpcore fashion trend",
      expect.objectContaining({ timeRange: "week", topic: "news" })
    );
  });
});
