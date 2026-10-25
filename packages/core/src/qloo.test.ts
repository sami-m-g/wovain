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
