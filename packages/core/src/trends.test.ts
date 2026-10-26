import type { TavilySearchOptions, TavilySearchResponse } from "@tavily/core";
import { describe, expect, it, vi } from "vitest";

import type { Qloo } from "./qloo";
import { createTrends } from "./trends";
import type { TavilySearch } from "./trends";

const now = new Date().toISOString();

const hit = (url: string, title: string, content = "") => ({
  content,
  id: url,
  publishedDate: now,
  score: 0.8,
  title,
  url,
});

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
                `https://news.example/${query.length}`,
                `${query} is trending`
              ),
              hit("ftp://bad.example/x", "not a web page"),
            ])
          : reply(query, [
              hit("https://www.etsy.com/listing/1", "Tee", "Price $30.00"),
              hit("https://www.etsy.com/listing/2", "Tee", "$34.00 now"),
            ])
      )
  );
  return { client: { search } satisfies TavilySearch, search };
};

const qlooWith = (tasteOf: Qloo["tasteOf"]): Qloo => ({ tasteOf });

describe("createTrends", () => {
  it("searches each Qloo theme on Tavily and ranks the ideas", async () => {
    const { client, search } = fakeTavily();
    const trends = createTrends(
      client,
      qlooWith(
        async () =>
          await Promise.resolve({
            names: ["Studio Ghibli"],
            themes: [
              { affinity: 0.9, id: "urn:tag:genre:anime", name: "anime" },
              { affinity: 0.2, id: "urn:tag:style:cozy", name: "cozy" },
            ],
          })
      )
    );

    const research = await trends.research("ghibli");

    expect(search).toHaveBeenCalledTimes(4);
    expect(research.qloo).toBe("used");
    expect(research.avoidNames).toEqual(["Studio Ghibli"]);
    expect(research.ideas.map((idea) => idea.rank)).toEqual([1, 2]);
    expect(research.ideas[0]?.theme).toBe("anime");
    const [top] = research.ideas;
    expect(top?.qlooTag).toBe("urn:tag:genre:anime");
    expect(
      top?.sources.every((source) => source.url.startsWith("https://"))
    ).toBe(true);
    expect(top?.references).toEqual(["https://images.example/ref.png"]);
    expect(top?.signals.marketHits).toBe(2);
  });

  it("falls back to the seed as the only theme when Qloo fails", async () => {
    const { client, search } = fakeTavily();
    const trends = createTrends(
      client,
      qlooWith(async () => await Promise.reject(new Error("Qloo is down")))
    );

    const error = vi.fn();
    const research = await trends.research("pickleball", {
      error,
      set: vi.fn(),
    });

    expect(error).toHaveBeenCalledWith(expect.any(Error));
    expect(research.qloo).toBe("failed");
    expect(research.ideas[0]?.signals.ipSafety).toBe(1);
    expect(search).toHaveBeenCalledTimes(2);
    expect(research.ideas.map((idea) => idea.theme)).toEqual(["pickleball"]);
  });

  it("never calls Qloo when trends-qloo is off (paid plans)", async () => {
    const { client, search } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>();
    const trends = createTrends(client, qlooWith(tasteOf));

    const research = await trends.research("pickleball", undefined, {
      qloo: false,
      tavily: true,
    });

    expect(tasteOf).not.toHaveBeenCalled();
    expect(research.qloo).toBe("off");
    expect(search).toHaveBeenCalledTimes(2);
    expect(research.ideas.map((idea) => idea.theme)).toEqual(["pickleball"]);
  });

  it("returns no ideas and calls nothing when trends-tavily is off", async () => {
    const { client, search } = fakeTavily();
    const tasteOf = vi.fn<Qloo["tasteOf"]>();
    const trends = createTrends(client, qlooWith(tasteOf));

    const research = await trends.research("pickleball", undefined, {
      qloo: true,
      tavily: false,
    });

    expect(search).not.toHaveBeenCalled();
    expect(tasteOf).not.toHaveBeenCalled();
    expect(research.ideas).toEqual([]);
  });
});
