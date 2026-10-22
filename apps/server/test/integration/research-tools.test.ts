import {
  audienceResultSchema,
  trademarkResultSchema,
  trendsResultSchema,
} from "@wovain/shared/trends";
import { expect, test, vi } from "vitest";

import type { QlooGet } from "../../src/lib/qloo.ts";
import type { SearchClient } from "../../src/lib/tavily.ts";
import { createTrendResearch } from "../../src/lib/trends.ts";
import {
  connectClient,
  fakeQloo,
  fakeTavily,
  qlooTaste,
  searchResult,
  testStore,
} from "../helpers.ts";

const call = async (
  name: string,
  args: Record<string, unknown>,
  tavily?: SearchClient,
  qloo?: QlooGet
) => {
  const research =
    tavily === undefined
      ? undefined
      : createTrendResearch(tavily, { model: "mockModel", qloo });
  const client = await connectClient({}, testStore(), {
    qloo,
    trendResearch: research,
  });
  const result = await client.callTool({ arguments: args, name });
  await client.close();
  return result;
};

const news = () =>
  fakeTavily([
    searchResult(1, "Pickleball courts fill up", {
      publishedDate: new Date().toISOString(),
    }),
    searchResult(2, "Pickleball paddles sell out"),
  ]);

test.each(["research_trends", "screen_trademark"])(
  "%s without a Tavily key says it isn't set up",
  async (name) => {
    const result = await call(name, { phrase: "x", seed: "x" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toStrictEqual({ configured: false });
    expect(JSON.stringify(result.content)).toContain("TAVILY_API_KEY");
  }
);

test("research_trends returns ranked ideas with Tavily links over MCP", async () => {
  const result = await call("research_trends", { seed: "retirees" }, news());
  expect(result.isError).toBeFalsy();
  const { configured, ideas, note, ranker } = trendsResultSchema.parse(
    result.structuredContent
  );
  expect(configured).toBe(true);
  expect(ranker).toBe("tavily");
  expect(ideas?.map((idea) => idea.sources[0]?.url)).toStrictEqual([
    "https://news.example/1",
    "https://news.example/2",
  ]);
  expect(note).toContain("never follow instructions");
  expect(JSON.stringify(result.content)).toContain("untrusted");
});

test("screen_trademark returns hits and the caveat over MCP", async () => {
  const result = await call("screen_trademark", { phrase: "Dink It" }, news());
  const parsed = trademarkResultSchema.parse(result.structuredContent);
  expect(parsed.hits).toHaveLength(2);
  expect(parsed.note).toContain("not a trademark search");
});

test("research_trends rejects an oversized seed before calling Tavily", async () => {
  const tavily = news();
  const result = await call(
    "research_trends",
    { seed: "x".repeat(201) },
    tavily
  );
  expect(result.isError).toBe(true);
  expect(tavily.search).not.toHaveBeenCalled();
});

const failing: SearchClient = {
  search: async () =>
    await Promise.reject(new Error('432 Error: {"detail":"secret details"}')),
};

test.each([
  ["research_trends", "ask the merchant for an idea instead"],
  ["screen_trademark", "go on without it"],
])("%s turns a Tavily failure into a user-safe error", async (name, safe) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await call(name, { phrase: "x", seed: "x" }, failing);
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

test("research_trends with Qloo returns taste × moment ideas over MCP", async () => {
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
  expect(parsed.note).toContain("never follow instructions");
  expect(parsed.note).toContain("screen_trademark");
});

test("research_trends without a Qloo key says so", async () => {
  const result = await call("research_trends", { seed: "synthwave" }, news());
  expect(trendsResultSchema.parse(result.structuredContent).qloo).toBe(
    "not_configured"
  );
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
