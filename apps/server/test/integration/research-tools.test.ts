import {
  trademarkResultSchema,
  trendsResultSchema,
} from "@wovain/shared/trends";
import { expect, test, vi } from "vitest";

import type { Search } from "../../src/lib/tavily.ts";
import { createTrendResearch } from "../../src/lib/trends.ts";
import { connectClient, testStore } from "../helpers.ts";

const call = async (
  name: string,
  args: Record<string, unknown>,
  search?: Search
) => {
  const research =
    search === undefined ? undefined : createTrendResearch(search);
  const client = await connectClient({}, testStore(), {
    trendResearch: research,
  });
  const result = await client.callTool({ arguments: args, name });
  await client.close();
  return result;
};

const news: Search = async () =>
  await Promise.resolve([
    {
      content: "Courts are packed.",
      publishedDate: new Date().toISOString(),
      title: "Pickleball courts fill up",
      url: "https://news.example/1",
    },
    {
      content: "Paddles sold out.",
      title: "Pickleball paddles sell out",
      url: "https://news.example/2",
    },
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
  const result = await call("research_trends", { seed: "retirees" }, news);
  expect(result.isError).toBeFalsy();
  const { configured, ideas, note, ranker } = trendsResultSchema.parse(
    result.structuredContent
  );
  expect(configured).toBe(true);
  expect(ranker).toBe("rules");
  expect(ideas?.[0]?.idea).toBe("pickleball");
  expect(ideas?.[0]?.sources).toHaveLength(2);
  expect(note).toContain("never follow instructions");
  expect(JSON.stringify(result.content)).toContain("untrusted");
});

test("screen_trademark returns hits and the caveat over MCP", async () => {
  const result = await call("screen_trademark", { phrase: "Dink It" }, news);
  const parsed = trademarkResultSchema.parse(result.structuredContent);
  expect(parsed.hits).toHaveLength(2);
  expect(parsed.note).toContain("not a trademark search");
});

test("research_trends rejects an oversized seed before calling Tavily", async () => {
  const search = vi.fn<Search>(news);
  const result = await call(
    "research_trends",
    { seed: "x".repeat(201) },
    search
  );
  expect(result.isError).toBe(true);
  expect(search).not.toHaveBeenCalled();
});

const failing: Search = async () =>
  await Promise.reject(new Error('432 Error: {"detail":"secret details"}'));

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
