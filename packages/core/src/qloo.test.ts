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
