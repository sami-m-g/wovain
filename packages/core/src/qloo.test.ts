import { afterEach, expect, it, vi } from "vitest";

import { createQloo, searchTermsOf } from "./qloo";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Answers Qloo's tag search with no tag, and every other call with the
// next of `replies`, in order.
const withNoTags =
  (replies: unknown[]) =>
  async (url: URL): Promise<Response> =>
    await Promise.resolve(
      Response.json(
        url.pathname === "/v2/tags"
          ? { results: { tags: [] } }
          : replies.shift()
      )
    );

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
  const fetchMock = vi.fn(withNoTags(replies));
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

it("reads Qloo's demographics and an audience's affinity for brands", async () => {
  const replies = [
    {
      results: {
        demographics: [
          {
            entity_id: "B1",
            query: {
              age: { "24_and_younger": 0.28, "25_to_29": -0.04 },
              gender: { female: 0.31, male: -0.31 },
            },
          },
        ],
      },
    },
    {
      results: {
        entities: [
          { entity_id: "B1", name: "Supreme", query: { affinity: 0.92 } },
        ],
      },
    },
  ];
  const fetchMock = vi.fn(
    async () => await Promise.resolve(Response.json(replies.shift()))
  );
  vi.stubGlobal("fetch", fetchMock);
  const qloo = createQloo({ apiKey: "k", baseURL: "https://qloo.example" });

  expect(await qloo.demographicsOf(["B1"])).toEqual([
    {
      age: { "24_and_younger": 0.28, "25_to_29": -0.04 },
      gender: { female: 0.31, male: -0.31 },
      id: "B1",
    },
  ]);
  expect(
    await qloo.audienceAffinity(
      "urn:audience:hobbies_and_interests:sneakerheads",
      "urn:entity:brand",
      ["B1"]
    )
  ).toEqual([0.92]);
  const [first, second] = fetchMock.mock.calls as unknown as [[URL], [URL]];
  expect(first[0].searchParams.get("filter.type")).toBe("urn:demographics");
  expect(second[0].searchParams.get("signal.demographics.audiences")).toBe(
    "urn:audience:hobbies_and_interests:sneakerheads"
  );
  expect(second[0].searchParams.get("filter.results.entities")).toBe("B1");
});

it("asks for entities and theme tags a shirt can use, not places", async () => {
  const replies = [
    { results: [{ entity_id: "E1", name: "Hiking Thru" }] },
    { results: { tags: [] } },
  ];
  const fetchMock = vi.fn(withNoTags(replies));
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "test-key",
    baseURL: "https://qloo.example",
  }).tasteOf("hiking");

  const [search, insights] = fetchMock.mock.calls
    .filter(([url]) => url.pathname !== "/v2/tags")
    .map(([url]) => url.searchParams);
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
  // The TV call failed: logged, recorded, and the rest of the taste stands.
  expect(error).toHaveBeenCalledTimes(1);
  expect(taste.failedDomains).toEqual(["tv_show"]);
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

  // The seed's entity search, its tag search, then the tags' insights.
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(taste.affinities).toBeUndefined();
  expect(taste.failedDomains).toBeUndefined();
});

it("records a domain whose affinities call fails, and keeps the others", async () => {
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.searchParams.get("filter.type") === "urn:entity:movie") {
      return await Promise.resolve(new Response("down", { status: 500 }));
    }
    return await routed({
      ...LIVE_LIKE,
      "/v2/insights:urn:entity:tv_show": { results: { entities: [] } },
    })(url);
  });
  vi.stubGlobal("fetch", fetchMock);
  const error = vi.fn();

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf("ghibli", { error, set: vi.fn() }, { crossDomain: true });

  expect(error).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining("500") })
  );
  expect(taste.failedDomains).toEqual(["movie"]);
  expect(taste.affinities?.map(({ id }) => id)).toEqual(["B1"]);
  expect(taste.themes.map((theme) => theme.name)).toEqual(["anime animation"]);
});

it("searches every reference type and keeps each entity's Qloo type", async () => {
  const fetchMock = vi.fn(
    async () =>
      await Promise.resolve(
        Response.json({
          results: [
            {
              entity_id: "Q-WES",
              name: "Wes Anderson",
              popularity: 0.9,
              types: ["urn:entity:person", "urn:entity:director"],
            },
          ],
        })
      )
  );
  vi.stubGlobal("fetch", fetchMock);

  const found = await createQloo({
    apiKey: "test-key",
    baseURL: "https://qloo.example",
  }).search("Wes Anderson");

  expect(found).toEqual([
    {
      id: "Q-WES",
      name: "Wes Anderson",
      popularity: 0.9,
      type: "urn:entity:person",
    },
  ]);
  const [url] = fetchMock.mock.calls[0] as unknown as [URL];
  expect(url.searchParams.get("types")).toContain("urn:entity:movie");
  expect(url.searchParams.get("take")).toBe("1");
});

// A merchant's brief, as typed on the new-drop page: a sentence, not a name.
const BRIEF =
  "Streetwear for Cairo night runners: bold, minimal & neon. Think 90s rave posters!";

it("searches Qloo for short names from a brief, not the sentence", () => {
  expect(searchTermsOf(BRIEF)).toEqual([
    "Streetwear for Cairo night runners",
    "bold",
    "minimal",
    "neon",
  ]);
  expect(searchTermsOf("Studio Ghibli")).toEqual(["Studio Ghibli"]);
  expect(searchTermsOf("  ¡¿ … !!  ")).toEqual([]);
  for (const term of searchTermsOf(`${"word ".repeat(40)}, x`)) {
    expect(term.length).toBeLessThanOrEqual(60);
  }
});

it("skips a search term Qloo answers 400 to and keeps the others", async () => {
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname === "/search") {
      return await Promise.resolve(
        url.searchParams.get("query") === "neon"
          ? Response.json({ results: [{ entity_id: "E1", name: "Neon" }] })
          : new Response('{"error":"bad query"}', { status: 400 })
      );
    }
    return await Promise.resolve(Response.json({ results: { tags: [] } }));
  });
  vi.stubGlobal("fetch", fetchMock);
  const set = vi.fn();

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf(BRIEF, { set });

  expect(taste.names).toEqual(["Neon"]);
  const queries = fetchMock.mock.calls
    .map(([url]) => url)
    .filter((url) => url.pathname === "/search")
    .map((url) => url.searchParams.get("query"));
  expect(queries).not.toContain(BRIEF);
  expect(set).toHaveBeenCalledWith({ qloo: { rejectedTerms: 3, terms: 4 } });
});

// QA 2026-10-29, run 8d7f7057: "Qloo found no audience for this brief".
it("searches a descriptive brief's subject words when it names nothing", async () => {
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname === "/search") {
      return await Promise.resolve(
        Response.json({
          results:
            url.searchParams.get("query") === "coffee"
              ? [{ entity_id: "E-COFFEE", name: "Blue Bottle Coffee" }]
              : [],
        })
      );
    }
    return await Promise.resolve(Response.json({ results: { tags: [] } }));
  });
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf("Retro 70s graphic tees for coffee lovers");

  expect(taste.names).toEqual(["Blue Bottle Coffee"]);
  const queries = fetchMock.mock.calls
    .map(([url]) => url)
    .filter((url) => url.pathname === "/search")
    .map((url) => url.searchParams.get("query"));
  expect(queries).toEqual([
    "Retro 70s graphic tees for coffee lovers",
    "retro",
    "70s",
    "graphic",
    "coffee",
  ]);
});

// Next, run 8c279e18: no entity, but "dark academia" is a Qloo tag.
it("matches a brief whose terms are Qloo tags, not entities", async () => {
  const DARK = "urn:tag:keyword:media:dark_academia";
  const replies: Record<string, (query: string | null) => unknown> = {
    "/search": () => ({ results: [] }),
    "/v2/insights": () => ({
      results: {
        tags: [
          {
            id: "urn:tag:genre:media:gothic",
            name: "Gothic",
            query: { affinity: 0.8 },
          },
        ],
      },
    }),
    "/v2/tags": (query) => ({
      results: {
        tags:
          query === "dark academia"
            ? [{ id: DARK, name: "Dark Academia" }]
            : [],
      },
    }),
  };
  const fetchMock = vi.fn(
    async (url: URL) =>
      await Promise.resolve(
        Response.json(
          replies[url.pathname]?.(url.searchParams.get("filter.query"))
        )
      )
  );
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf(
    "Gothic botanical tees for plant lovers who like dark academia",
    undefined,
    { terms: ["Gothic botanical", "dark academia"] }
  );

  expect(taste.themes.map(({ name }) => name)).toEqual(["Gothic"]);
  const insights = fetchMock.mock.calls
    .map(([url]) => url)
    .find((url) => url.pathname === "/v2/insights");
  expect(insights?.searchParams.get("signal.interests.tags")).toBe(DARK);
  expect(insights?.searchParams.has("signal.interests.entities")).toBe(false);
});

it("keeps a tag match when Qloo rejects every entity search", async () => {
  const GOTHIC = "urn:tag:genre:media:gothic";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) => {
      if (url.pathname === "/search") {
        return await Promise.resolve(new Response("bad", { status: 400 }));
      }
      return await Promise.resolve(
        Response.json({
          results: {
            tags: [{ id: GOTHIC, name: "Gothic", query: { affinity: 0.7 } }],
          },
        })
      );
    })
  );

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf("gothic");

  expect(taste.themes.map(({ id }) => id)).toEqual([GOTHIC]);
});

it("fails the taste when Qloo rejects every term", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => await Promise.resolve(new Response("bad", { status: 400 }))
    )
  );

  await expect(
    createQloo({ apiKey: "k", baseURL: "https://qloo.example" }).tasteOf(BRIEF)
  ).rejects.toThrow("Qloo /search answered 400");
});

it("fails the taste when Qloo refuses the key, even on one term", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      url.searchParams.get("query") === "neon"
        ? await Promise.resolve(new Response("no", { status: 401 }))
        : await Promise.resolve(new Response("bad", { status: 400 }))
    )
  );

  await expect(
    createQloo({ apiKey: "k", baseURL: "https://qloo.example" }).tasteOf(BRIEF)
  ).rejects.toThrow("Qloo /search answered 401");
});

it("makes no Qloo call for a seed with no words", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const taste = await createQloo({
    apiKey: "k",
    baseURL: "https://qloo.example",
  }).tasteOf("?!");

  expect(taste).toEqual({ names: [], themes: [] });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("reuses an answer for the same request and forgets a failed one", async () => {
  let calls = 0;
  const fetchMock = vi.fn(async () => {
    calls += 1;
    return await Promise.resolve(
      calls === 1
        ? new Response("bad request", { status: 400 })
        : Response.json({
            results: {
              tags: [{ id: "urn:tag:genre:media:goth", name: "Goth" }],
            },
          })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const qloo = createQloo({ apiKey: "key", baseURL: "https://qloo.test" });
  await expect(qloo.tagsFor(["E1"])).rejects.toThrow("answered 400");
  const first = await qloo.tagsFor(["E1"]);
  const again = await qloo.tagsFor(["E1"]);
  expect(again).toStrictEqual(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

const TAGS_REPLY = {
  results: { tags: [{ id: "urn:tag:genre:media:goth", name: "Goth" }] },
};

it("waits out a burst of 429s longer than other failures", async () => {
  vi.useFakeTimers();
  const statuses = [429, 429, 429, 429];
  const fetchMock = vi.fn(async () => {
    const status = statuses.shift();
    return await Promise.resolve(
      status === undefined
        ? Response.json(TAGS_REPLY)
        : new Response("slow down", { status })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const qloo = createQloo({ apiKey: "key", baseURL: "https://qloo.test" });
  const tags = qloo.tagsFor(["E1"]);
  await vi.runAllTimersAsync();
  await expect(tags).resolves.toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

it("gives up on a 5xx after two retries", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(
    async () => await Promise.resolve(new Response("down", { status: 503 }))
  );
  vi.stubGlobal("fetch", fetchMock);
  const qloo = createQloo({ apiKey: "key", baseURL: "https://qloo.test" });
  const tags = expect(qloo.tagsFor(["E2"])).rejects.toThrow("answered 503");
  await vi.runAllTimersAsync();
  await tags;
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("still retries a 5xx that follows a run of 429s", async () => {
  vi.useFakeTimers();
  const statuses = [429, 429, 503];
  const fetchMock = vi.fn(async () => {
    const status = statuses.shift();
    return await Promise.resolve(
      status === undefined
        ? Response.json(TAGS_REPLY)
        : new Response("busy", { status })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  const qloo = createQloo({ apiKey: "key", baseURL: "https://qloo.test" });
  const tags = qloo.tagsFor(["E3"]);
  await vi.runAllTimersAsync();
  await expect(tags).resolves.toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
