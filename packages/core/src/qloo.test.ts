import { afterEach, expect, it, vi } from "vitest";

import { createQloo } from "./qloo";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("keeps one theme per Qloo tag spelling, highest affinity first", async () => {
  const replies = [
    { results: [{ entity_id: "E1", name: "Studio Ghibli" }] },
    {
      results: {
        tags: [
          {
            name: "JPop",
            query: { affinity: 0.9 },
            tag_id: "urn:tag:genre:music:jpop",
          },
          {
            name: " J-pop",
            query: { affinity: 0.99 },
            tag_id: "urn:tag:genre:music:j_pop",
          },
          {
            name: "anime",
            query: { affinity: 0.95 },
            tag_id: "urn:tag:genre:music:anime",
          },
          { name: "not a tag", tag_id: "javascript-ish" },
        ],
      },
    },
  ];
  const fetchMock = vi.fn(
    async () => await Promise.resolve(Response.json(replies.shift()))
  );
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "test-key",
    baseURL: "https://qloo.example",
  }).tasteOf("ghibli");

  expect(taste.themes.map((theme) => theme.name)).toEqual(["J-pop", "anime"]);
  expect(taste.names).toEqual(["Studio Ghibli"]);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({
      headers: expect.objectContaining({ "X-Api-Key": "test-key" }),
    })
  );
});

it("asks for entities and theme tags a shirt can use, not places", async () => {
  const replies = [
    { results: [{ entity_id: "E1", name: "Hiking Thru" }] },
    { results: { tags: [] } },
  ];
  const fetchMock = vi.fn(
    async (_url: URL) => await Promise.resolve(Response.json(replies.shift()))
  );
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "test-key",
    baseURL: "https://qloo.example",
  }).tasteOf("hiking");

  const [search, insights] = fetchMock.mock.calls.map(
    ([url]) => url.searchParams
  );
  expect(search?.get("types")).not.toContain("urn:entity:place");
  expect(insights?.get("filter.tag.types")).toContain("urn:tag:genre:media");
  expect(taste.themes).toEqual([]);
});

it("throws when Qloo answers an error status", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => await Promise.resolve(new Response("no", { status: 403 }))
    )
  );

  await expect(
    createQloo({ apiKey: "k", baseURL: "https://qloo.example" }).tasteOf("x")
  ).rejects.toThrow("qloo taste failed");
});

// Replies by Qloo path and filter.type, shaped as the live API answered on
// 2026-10-28 (trimmed). A route without a reply answers 400.
const routed =
  (replies: Record<string, unknown>) =>
  async (url: URL): Promise<Response> => {
    const type = url.searchParams.get("filter.type") ?? "";
    const reply = replies[`${url.pathname}:${type}`];
    return await Promise.resolve(
      reply === undefined
        ? new Response("no", { status: 400 })
        : Response.json(reply)
    );
  };

const explained = (shares: [string, number][]) => ({
  affinity: 0.9,
  explainability: {
    "signal.interests.entities": shares.map(([entity_id, score]) => ({
      entity_id,
      score,
    })),
  },
});

const LIVE_LIKE = {
  "/search:": {
    results: [
      { entity_id: "E1", name: "Studio Ghibli", types: ["urn:entity:artist"] },
      { entity_id: "E2", name: "Mirai", types: ["urn:entity:movie"] },
    ],
  },
  "/v2/insights:urn:entity:brand": {
    results: {
      entities: [
        {
          entity_id: "B1",
          name: "Zozotown",
          properties: {
            emotional_tone: ["Trendy", "Accessible"],
            personal_style: ["Minimalist", "null", "Casual"],
          },
          query: explained([
            ["E1", 0.57],
            ["E2", 0.43],
          ]),
          subtype: "urn:entity:brand",
        },
      ],
    },
  },
  "/v2/insights:urn:entity:movie": {
    results: {
      entities: [
        {
          entity_id: "M1",
          name: "Dragon Quest: Your Story",
          query: explained([["E1", 1]]),
          subtype: "urn:entity:movie",
          tags: [
            { name: "Cinematic", type: "urn:tag:style:qloo" },
            { name: "Family fantasy", type: "urn:tag:subgenre:qloo" },
            { name: "Based on video game", type: "urn:tag:keyword:media" },
          ],
        },
      ],
    },
  },
  "/v2/insights:urn:tag": {
    results: {
      tags: [
        {
          name: "anime animation",
          query: { affinity: 0.99 },
          tag_id: "urn:tag:keyword:media:anime_animation",
        },
      ],
    },
  },
};

it("explains the cross-domain affinities of the seed's fans", async () => {
  const fetchMock = vi.fn(routed(LIVE_LIKE));
  vi.stubGlobal("fetch", fetchMock);
  const error = vi.fn();

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf("ghibli", { error, set: vi.fn() }, { crossDomain: true });

  expect(taste.seeds).toEqual([
    { id: "E1", name: "Studio Ghibli", type: "artist" },
    { id: "E2", name: "Mirai", type: "movie" },
  ]);
  expect(taste.affinities).toEqual([
    {
      affinity: 0.9,
      because: [
        { id: "E1", name: "Studio Ghibli", share: 0.57 },
        { id: "E2", name: "Mirai", share: 0.43 },
      ],
      cues: ["Minimalist", "Casual", "Trendy", "Accessible"],
      id: "B1",
      name: "Zozotown",
      type: "brand",
    },
    {
      affinity: 0.9,
      because: [{ id: "E1", name: "Studio Ghibli", share: 1 }],
      cues: ["Cinematic", "Family fantasy"],
      id: "M1",
      name: "Dragon Quest: Your Story",
      type: "movie",
    },
  ]);
  // Affinity names are protected like the seed's own matches.
  expect(taste.names).toContain("Zozotown");
  // The TV call failed: logged, and the rest of the taste stands.
  expect(error).toHaveBeenCalledTimes(1);
  expect(taste.themes.map((theme) => theme.name)).toEqual(["anime animation"]);
  const entityCalls = fetchMock.mock.calls
    .map(([url]) => url.searchParams)
    .filter((params) => params.get("filter.type")?.startsWith("urn:entity"));
  expect(entityCalls).toHaveLength(3);
  for (const params of entityCalls) {
    expect(params.get("feature.explainability")).toBe("true");
    expect(params.get("bias.trends")).toBe("low");
  }
});

it("makes no cross-domain calls unless asked", async () => {
  const fetchMock = vi.fn(routed(LIVE_LIKE));
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf("ghibli");

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(taste.affinities).toBeUndefined();
});
