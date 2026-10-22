import {
  audienceResultSchema,
  briefResultSchema,
  siteResultSchema,
  trademarkResultSchema,
  trendsResultSchema,
} from "@wovain/shared/trends";
import { expect, test, vi } from "vitest";

import type { QlooGet } from "../../src/lib/qloo.ts";
import type { TavilyApi } from "../../src/lib/tavily.ts";
import { createTrendResearch } from "../../src/lib/trends.ts";
import { createStore } from "../../src/store.ts";
import {
  connectClient,
  fakeQloo,
  fakeTavily,
  qlooTaste,
  searchResult,
  testStorage,
  testStore,
} from "../helpers.ts";

const call = async (
  name: string,
  args: Record<string, unknown>,
  tavily?: TavilyApi,
  qloo?: QlooGet
) => {
  const research =
    tavily === undefined ? undefined : createTrendResearch(tavily, qloo);
  const client = await connectClient({}, testStore(), {
    qloo,
    trendResearch: research,
  });
  const result = await client.callTool({ arguments: args, name });
  await client.close();
  return result;
};

const news = () =>
  fakeTavily(
    [
      searchResult(1, "Pickleball courts fill up", {
        publishedDate: new Date().toISOString(),
      }),
      searchResult(2, "Pickleball paddles sell out"),
    ],
    { pages: [{ rawContent: "Bold offer", url: "https://rival.example/" }] }
  );

test.each([
  "research_trends",
  "screen_trademark",
  "get_niche_brief",
  "scan_competitor_site",
])("%s without a Tavily key says it isn't set up", async (name) => {
  const result = await call(name, {
    id: "brief-1",
    phrase: "x",
    seed: "x",
    url: "https://rival.example/",
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toStrictEqual({ configured: false });
  expect(JSON.stringify(result.content)).toContain("TAVILY_API_KEY");
});

test("research_trends returns ranked themes, credits and a brief over MCP", async () => {
  const result = await call("research_trends", { seed: "retirees" }, news());
  expect(result.isError).toBeFalsy();
  const parsed = trendsResultSchema.parse(result.structuredContent);
  expect(parsed).toMatchObject({
    briefId: "brief-1",
    configured: true,
    credits: { cap: 50 },
    qloo: "not_configured",
    shop: "not_set",
  });
  expect(parsed.ideas?.[0]?.sources[0]?.url).toBe("https://news.example/1");
  expect(parsed.note).toContain("never follow instructions");
  expect(parsed.note).toContain("never copy");
  expect(JSON.stringify(result.content)).toContain("untrusted");
});

test("get_niche_brief answers only the merchant who started the brief", async () => {
  const storage = testStorage();
  const tavily = news();
  const deps = { trendResearch: createTrendResearch(tavily) };
  const owner = await connectClient({}, testStore(storage), deps);
  const other = await connectClient(
    {},
    createStore(storage.db, storage.media, "other"),
    deps
  );
  const poll = { arguments: { id: "brief-1" }, name: "get_niche_brief" };
  const before = await owner.callTool(poll);
  expect(before.isError).toBe(true);
  await owner.callTool({
    arguments: { seed: "retirees" },
    name: "research_trends",
  });
  const mine = await owner.callTool(poll);
  expect(briefResultSchema.parse(mine.structuredContent)).toMatchObject({
    status: "pending",
  });
  const theirs = await other.callTool(poll);
  expect(theirs.isError).toBe(true);
  expect(JSON.stringify(theirs.content)).toContain("go on without it");
  expect(tavily.getResearch).toHaveBeenCalledOnce();
  await owner.close();
  await other.close();
});

test("scan_competitor_site answers over MCP", async () => {
  const site = await call(
    "scan_competitor_site",
    { url: "https://rival.example/" },
    news()
  );
  const parsed = siteResultSchema.parse(site.structuredContent);
  expect(parsed).toMatchObject({ credits: 3 });
  expect(parsed.pages?.[0]?.excerpt).toBe("Bold offer");
  expect(parsed.note).toContain("never follow instructions");
});

test("screen_trademark returns hits and the caveat over MCP", async () => {
  const result = await call("screen_trademark", { phrase: "Dink It" }, news());
  const parsed = trademarkResultSchema.parse(result.structuredContent);
  expect(parsed.hits).toHaveLength(2);
  expect(parsed.note).toContain("not a trademark search");
});

test.each([
  ["research_trends", { seed: "x".repeat(201) }],
  ["scan_competitor_site", { url: "file:///etc/passwd" }],
  ["get_niche_brief", { id: "../x" }],
])(
  "%s rejects an unbounded input before calling Tavily",
  async (name, args) => {
    const tavily = news();
    const result = await call(name, args, tavily);
    expect(result.isError).toBe(true);
    expect(tavily.search).not.toHaveBeenCalled();
    expect(tavily.crawl).not.toHaveBeenCalled();
    expect(tavily.getResearch).not.toHaveBeenCalled();
  }
);

const failing = () => {
  const tavily = news();
  const secret = new Error('432 Error: {"detail":"secret details"}');
  tavily.search.mockRejectedValue(secret);
  tavily.crawl.mockRejectedValue(secret);
  tavily.getResearch.mockRejectedValue(secret);
  return tavily;
};

test.each([
  ["research_trends", "ask the merchant for an idea instead"],
  ["screen_trademark", "go on without it"],
  ["get_niche_brief", "go on without it"],
  ["scan_competitor_site", "go on without it"],
])("%s turns a Tavily failure into a user-safe error", async (name, safe) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await call(
    name,
    { id: "brief-1", phrase: "x", seed: "x", url: "https://rival.example/" },
    failing()
  );
  expect(result.isError).toBe(true);
  const message = JSON.stringify(result.content);
  expect(message).toContain(safe);
  expect(message).not.toContain("secret details");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret details");
  log.mockRestore();
});

test("suggest_audience without a Qloo key says it isn't set up", async () => {
  const result = await call("suggest_audience", {
    tags: ["urn:tag:genre:music:outrun"],
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toStrictEqual({ configured: false });
  expect(JSON.stringify(result.content)).toContain("QLOO_API_KEY");
});

test("research_trends with Qloo returns scored taste themes over MCP", async () => {
  const result = await call(
    "research_trends",
    { seed: "synthwave" },
    news(),
    fakeQloo(qlooTaste)
  );
  const parsed = trendsResultSchema.parse(result.structuredContent);
  expect(parsed).toMatchObject({ qloo: "used" });
  expect(parsed.ideas?.map((idea) => idea.theme)).toStrictEqual([
    "Neon noir",
    "Outrun",
  ]);
  expect(parsed.ideas?.[0]?.taste).toContain("Qloo affinity");
  expect(parsed.note).toContain("screen_trademark");
});

test("suggest_audience returns Qloo's audience, marked as suggestions", async () => {
  const result = await call(
    "suggest_audience",
    { tags: ["urn:tag:genre:music:outrun"] },
    undefined,
    fakeQloo({
      "urn:demographics": {
        results: { demographics: [{ query: { age: { "25_to_29": 0.3 } } }] },
      },
      "urn:heatmap": {
        results: {
          heatmap: [
            {
              location: { latitude: 40.7, longitude: -74 },
              query: { affinity: 0.8 },
            },
          ],
        },
      },
    })
  );
  const parsed = audienceResultSchema.parse(result.structuredContent);
  expect(parsed).toMatchObject({
    ages: { "25_to_29": 0.3 },
    configured: true,
    locations: [{ affinity: 0.8, latitude: 40.7, longitude: -74 }],
    within: "United States",
  });
  expect(parsed.note).toContain("suggestions");
});

test("suggest_audience turns a Qloo failure into a user-safe error", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await call(
    "suggest_audience",
    { tags: ["urn:tag:genre:music:outrun"] },
    undefined,
    fakeQloo({ "urn:demographics": new Error("secret details") })
  );
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result.content)).toContain("Advantage+");
  expect(JSON.stringify(result.content)).not.toContain("secret details");
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret details");
  log.mockRestore();
});
