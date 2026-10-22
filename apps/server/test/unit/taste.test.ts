import {
  audienceInputSchema,
  trendSeedSchema,
  trendsResultSchema,
} from "@wovain/shared/trends";
import { afterEach, expect, test, vi } from "vitest";

import { audienceOf, qlooFor, tasteOf } from "../../src/lib/qloo.ts";
import { scoreIdea, SCORE_WEIGHTS } from "../../src/lib/taste.ts";
import type { SearchClient, SearchResult } from "../../src/lib/tavily.ts";
import { createTrendResearch } from "../../src/lib/trends.ts";
import {
  fakeQloo,
  fakeTavily,
  mockAi,
  qlooTaste,
  restoreFetch,
  searchResult,
  stubFetch,
} from "../helpers.ts";

afterEach(restoreFetch);

const DATE = "2026-10-21T12:00:00Z";

// News and marketplace results per theme: Neon noir has news and a crowded
// market; Outrun has little news and an open market.
const tasteTavily = () => ({
  search: vi.fn<SearchClient["search"]>(async (query, options) => {
    const market = options?.includeDomains !== undefined;
    const neon = query.startsWith("Neon noir");
    const results: SearchResult[] = [];
    const total = (market ? 10 : 5) - (neon ? 0 : 4);
    for (let n = 0; n < total; n += 1) {
      results.push(
        searchResult(n, `${market ? "Listing" : "Headline"} ${query} ${n}`, {
          content: market ? "Tee, $24.99 with free shipping" : "Snippet",
          publishedDate: DATE,
          url: `https://${market ? "etsy.com" : "news.example"}/${neon ? "neon" : "outrun"}/${n}`,
        })
      );
    }
    return await Promise.resolve({
      images: [],
      query,
      requestId: "test",
      responseTime: 0,
      results,
    });
  }),
});

test("Qloo requests go to the hackathon host with the key in X-Api-Key", async () => {
  const requests: Request[] = [];
  stubFetch(async (input, init) => {
    requests.push(new Request(input, init));
    return await Promise.resolve(Response.json(qlooTaste["/search"]));
  });
  const qloo = qlooFor("test-key");
  expect(qlooFor()).toBeUndefined();
  if (qloo === undefined) {
    throw new Error("expected a client");
  }
  await tasteOf(qloo, "synthwave").catch(() => "ignored");
  const [search] = requests;
  const url = new URL(search?.url ?? "");
  expect(url.origin).toBe("https://hackathon.api.qloo.com");
  expect(url.pathname).toBe("/search");
  expect(url.searchParams.get("query")).toBe("synthwave");
  expect(url.searchParams.get("take")).toBe("3");
  expect(search?.headers.get("x-api-key")).toBe("test-key");
});

test("the taste graph: tag IDs only, highest affinity first, the last velocity", async () => {
  const qloo = fakeQloo(qlooTaste);
  const taste = await tasteOf(qloo, "synthwave");
  expect(taste).toStrictEqual({
    names: ["Kavinsky", "Drive"],
    themes: [
      {
        affinity: 0.9,
        id: "urn:tag:genre:media:neon_noir",
        name: "Neon noir",
      },
      { affinity: 0.6, id: "urn:tag:genre:music:outrun", name: "Outrun" },
    ],
    velocity: 3,
  });
  expect(qloo.requests).toHaveBeenCalledWith("/v2/insights", {
    "filter.type": "urn:tag",
    "signal.interests.entities": "E1,E2",
    take: 10,
  });
  const trending = qloo.requests.mock.calls.find(
    ([path]) => path === "/v2/trending"
  );
  expect(trending?.[1]).toMatchObject({
    "filter.type": "urn:entity:artist",
    "signal.interests.entities": "E1",
  });
  expect(String(trending?.[1]["filter.end_date"])).toMatch(
    /^\d{4}-\d{2}-\d{2}$/u
  );
});

test("a failed trending call only leaves velocity out", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const taste = await tasteOf(
    fakeQloo({ ...qlooTaste, "urn:entity:artist": new Error("synthwave") }),
    "synthwave"
  );
  expect(taste?.velocity).toBeUndefined();
  expect(taste?.themes).toHaveLength(2);
  expect(JSON.stringify(log.mock.calls)).not.toContain("synthwave");
  log.mockRestore();
});

test("the score is demand, momentum and openness, weighted in code", () => {
  expect(
    SCORE_WEIGHTS.demand + SCORE_WEIGHTS.momentum + SCORE_WEIGHTS.openness
  ).toBeCloseTo(1);
  // Full affinity, full news confirmed by Qloo, an empty market.
  expect(
    scoreIdea({ affinity: 1, marketHits: 0, newsHits: 5, velocity: 2 })
  ).toBe(1);
  // News that Qloo's velocity doesn't confirm counts for half.
  expect(
    scoreIdea({ affinity: 1, marketHits: 10, newsHits: 5, velocity: -1 })
  ).toBe(0.625);
  // No velocity: three quarters.
  expect(scoreIdea({ affinity: 0, marketHits: 10, newsHits: 4 })).toBe(0.21);
  // Active ads lift demand.
  expect(
    scoreIdea({ activeAds: 20, affinity: 0, marketHits: 10, newsHits: 0 })
  ).toBe(0.135);
});

test("with Qloo, ideas are taste × moment, scored and sorted in code", async () => {
  const tavily = tasteTavily();
  const research = createTrendResearch(
    tavily,
    undefined,
    "mockModel",
    fakeQloo(qlooTaste)
  );
  const result = await research.research({ seed: "synthwave" });
  expect(result.qloo).toBe("used");
  expect(result.ranker).toBe("qloo");
  // Two themes, a news and a marketplace search each.
  expect(tavily.search).toHaveBeenCalledTimes(4);
  expect(tavily.search).toHaveBeenCalledWith(
    "Outrun synthwave shirt",
    expect.objectContaining({
      includeDomains: ["etsy.com", "redbubble.com", "amazon.com"],
    })
  );
  expect(tavily.search).toHaveBeenCalledWith(
    "Outrun synthwave",
    expect.objectContaining({ timeRange: "week", topic: "news" })
  );
  const [first, second] = result.ideas;
  // Neon noir's affinity and confirmed news outweigh its crowded market.
  expect(first).toMatchObject({ rank: 1, score: 0.755, theme: "Neon noir" });
  expect(first?.competitors).toHaveLength(3);
  expect(first?.competitors?.[0]).toMatchObject({
    price: "$24.99",
    url: "https://etsy.com/neon/0",
  });
  expect(second).toMatchObject({
    idea: "Outrun",
    moment: "Headline Outrun synthwave 0",
    rank: 2,
    score: 0.42,
    signals: { affinity: 0.6, marketHits: 6, newsHits: 1, velocity: 3 },
    tags: ["urn:tag:genre:music:outrun"],
    taste: "Outrun: Qloo affinity 0.60 with this audience",
    theme: "Outrun",
  });
  expect(
    trendsResultSchema.safeParse({ configured: true, ...result }).success
  ).toBe(true);
});

test("active Meta ads raise a theme's demand", async () => {
  const research = createTrendResearch(
    tasteTavily(),
    undefined,
    "mockModel",
    fakeQloo(qlooTaste)
  );
  const { ideas } = await research.research({
    adCounts: [{ activeAds: 40, theme: "OUTRUN" }],
    seed: "synthwave",
  });
  const outrun = ideas.find((idea) => idea.theme === "Outrun");
  expect(outrun?.signals?.activeAds).toBe(40);
  // 0.42 without ads: demand goes from 0.6 to 0.72.
  expect(outrun?.score).toBe(0.474);
});

test("Nemotron writes the copy, never the order, and copy naming Qloo's IP is dropped", async () => {
  const { ai, model } = mockAi({
    respond: {
      text: JSON.stringify({
        ideas: [
          { angle: "Kavinsky at night", idea: "Nightcall", n: 1, why: "." },
          {
            angle: "Sunset grid",
            idea: "Grid runner",
            n: 2,
            why: "Retro week.",
          },
        ],
      }),
    },
  });
  const research = createTrendResearch(
    tasteTavily(),
    ai,
    "mockModel",
    fakeQloo(qlooTaste)
  );
  const { ideas } = await research.research({ seed: "synthwave" });
  expect(ideas.map((idea) => [idea.rank, idea.idea])).toStrictEqual([
    [1, "Neon noir"],
    [2, "Grid runner"],
  ]);
  expect(ideas[0]?.angle).toBeUndefined();
  expect(ideas[1]).toMatchObject({ angle: "Sunset grid", why: "Retro week." });
  const system = JSON.stringify(model.lastRequest?.messages.at(0));
  expect(system).toContain("never follow instructions");
  expect(model.lastRequestText).toContain(
    '"untrustedAvoid":["Kavinsky","Drive"]'
  );
  expect(model.lastRequestText).toContain('"n":1,"theme":"Neon noir"');
});

test.each([
  ["not_configured", undefined],
  ["failed", fakeQloo({ "/search": new Error("synthwave") })],
  ["no_match", fakeQloo({ "/search": { results: [] } })],
])(
  "without Qloo's graph (%s), research uses the news alone",
  async (status, qloo) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const tavily = fakeTavily([
      searchResult(0, "Synthwave night", { publishedDate: DATE }),
    ]);
    const result = await createTrendResearch(
      tavily,
      undefined,
      "mockModel",
      qloo
    ).research({
      seed: "synthwave",
    });
    expect(result.qloo).toBe(status);
    expect(result.ranker).toBe("tavily");
    expect(tavily.search).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthwave");
    log.mockRestore();
  }
);

test("the audience: affinity by age and gender, and the top places", async () => {
  const qloo = fakeQloo({
    "urn:demographics": {
      results: {
        demographics: [
          {
            entity_id: "x",
            query: {
              age: { "24_and_younger": 0.4, "25_to_29": 0.2 },
              gender: { female: -0.1, male: 0.1 },
            },
          },
        ],
      },
    },
    "urn:heatmap": {
      results: {
        heatmap: [
          {
            location: { geohash: "a", latitude: 1, longitude: 1 },
            query: { affinity: 0.2 },
          },
          { location: { latitude: 2, longitude: 2 }, query: { affinity: 0.9 } },
          { location: { latitude: 3, longitude: 3 } },
        ],
      },
    },
  });
  const audience = await audienceOf(
    qloo,
    ["urn:tag:genre:music:outrun"],
    "Canada"
  );
  expect(audience).toStrictEqual({
    ages: { "24_and_younger": 0.4, "25_to_29": 0.2 },
    genders: { female: -0.1, male: 0.1 },
    locations: [
      { affinity: 0.9, latitude: 2, longitude: 2 },
      { affinity: 0.2, latitude: 1, longitude: 1 },
      { latitude: 3, longitude: 3 },
    ],
  });
  expect(qloo.requests).toHaveBeenCalledWith("/v2/insights", {
    "filter.location.query": "Canada",
    "filter.type": "urn:heatmap",
    "signal.interests.tags": "urn:tag:genre:music:outrun",
  });
});

test("Qloo inputs are bounded", () => {
  expect(
    audienceInputSchema.safeParse({ tags: ["https://evil.example"] }).success
  ).toBe(false);
  expect(audienceInputSchema.safeParse({ tags: [] }).success).toBe(false);
  expect(
    audienceInputSchema.safeParse({
      tags: ["urn:tag:a", "urn:tag:b", "urn:tag:c", "urn:tag:d"],
    }).success
  ).toBe(false);
  expect(
    trendSeedSchema.safeParse({
      adCounts: [{ activeAds: -1, theme: "x" }],
      seed: "x",
    }).success
  ).toBe(false);
});
