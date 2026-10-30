import type { TavilySearchOptions } from "@tavily/core";
import { describe, expect, it, vi } from "vitest";

import {
  checkTrademarks,
  competitorPrices,
  dossierOf,
  priceOnPage,
  readDossier,
  sourceTitle,
  startDossier,
  trademarkNote,
  verdictOf,
} from "./evidence";

const hit = (url: string, title: string, content = "") => ({
  content,
  id: url,
  publishedDate: "",
  score: 0.8,
  title,
  url,
});

const searchReply = (results: ReturnType<typeof hit>[]) => ({
  images: [],
  query: "q",
  requestId: "r",
  responseTime: 0.1,
  results,
});

describe("verdictOf", () => {
  it("blocks a phrase a trademark register's title carries", () => {
    const verdict = verdictOf("Spooky Season", [
      hit(
        "https://www.trademarkia.com/spooky-season-123",
        "SPOOKY SEASON Trademark of Acme Inc."
      ),
    ]);
    expect(verdict.verdict).toBe("blocked");
    expect(verdict.citations[0]?.url).toBe(
      "https://www.trademarkia.com/spooky-season-123"
    );
  });

  it("cautions on marketplace listings and clears the rest", () => {
    expect(
      verdictOf("Spooky Season", [
        hit("https://www.etsy.com/listing/1", "Spooky Season Tee"),
      ]).verdict
    ).toBe("caution");
    expect(
      verdictOf("Spooky Season", [
        hit("https://www.trademarkia.com/x", "SPOOKY Trademark"),
        hit("https://news.example/a", "Spooky Season is here"),
      ]).verdict
    ).toBe("clear");
  });
});

describe("checkTrademarks", () => {
  it("searches each long phrase once, exactly, on the registers", async () => {
    const search = vi.fn(
      async (_query: string, _options?: TavilySearchOptions) =>
        await Promise.resolve(
          searchReply([
            hit("https://trademarks.justia.com/1", "GHOST MODE - Trademark"),
          ])
        )
    );
    const check = await checkTrademarks({ search }, [
      "Ghost Mode",
      "ghost mode",
      "BOO",
    ]);
    expect(search).toHaveBeenCalledOnce();
    const [query, options] = search.mock.calls[0] ?? [];
    expect(query).toBe('"Ghost Mode" trademark');
    expect(options?.exactMatch).toBe(true);
    expect(options?.includeDomains).toContain("uspto.gov");
    expect(check.pass).toBe(false);
    expect(check.checks.map((c) => c.verdict)).toEqual(["blocked", "clear"]);
    expect(trademarkNote(check)).toContain("trademarks.justia.com");
  });

  it("fails closed and logs when a search fails", async () => {
    const error = vi.fn();
    const check = await checkTrademarks(
      {
        search: async () => await Promise.reject(new Error("429 rate limit")),
      },
      ["Night Shift Crew"],
      { error, set: vi.fn() }
    );
    expect(check.pass).toBe(false);
    expect(check.checks[0]?.verdict).toBe("unchecked");
    expect(error).toHaveBeenCalledOnce();
    expect(trademarkNote(check)).toContain("couldn't be checked");
  });
});

describe("competitorPrices", () => {
  it("reads one price per listing and keeps Tavily's failed pages", async () => {
    const extract = vi.fn(
      async (_urls: string[]) =>
        await Promise.resolve({
          failedResults: [{ error: "timeout", url: "https://etsy.com/l/3" }],
          requestId: "r",
          responseTime: 1,
          results: [
            {
              rawContent: "Classic Tee $24.99 Shipping $4.99 Related $26.00",
              title: "Ghost Tee",
              url: "https://www.redbubble.com/i/t-shirt/1",
            },
            {
              rawContent: "No price here",
              title: "Ghost Hoodie",
              url: "https://www.teepublic.com/t-shirt/2",
            },
          ],
        })
    );
    const set = vi.fn();
    const prices = await competitorPrices(
      { extract },
      [
        "https://www.redbubble.com/i/t-shirt/1",
        "https://www.teepublic.com/t-shirt/2",
        "https://etsy.com/l/3",
        "https://news.example/not-a-shop",
      ],
      { set }
    );
    expect(extract.mock.calls[0]?.[0]).toHaveLength(3);
    expect(prices.prices).toEqual([24.99]);
    expect(prices.median).toBe(24.99);
    expect(prices.failed).toEqual([
      { error: "timeout", url: "https://etsy.com/l/3" },
    ]);
    expect(prices.citations).toHaveLength(1);
  });

  it("skips the call without marketplace listings", async () => {
    const extract = vi.fn();
    const prices = await competitorPrices({ extract }, ["https://x.example"]);
    expect(extract).not.toHaveBeenCalled();
    expect(prices.median).toBeUndefined();
  });

  it("ignores prices outside a garment's range", () => {
    expect(priceOnPage("Free shipping over $500, sticker $3")).toBeUndefined();
  });
});

describe("dossier", () => {
  it("starts research on the configured model with the schema and the Qloo file", async () => {
    const research = vi.fn(
      async () =>
        await Promise.resolve({
          createdAt: "",
          input: "",
          model: "mini",
          requestId: "req-1",
          responseTime: 0,
          status: "pending",
        })
    );
    const started = await startDossier(
      { research },
      {
        model: "pro",
        seed: "horror",
        taste: { qlooTag: "urn:tag:x" },
        theme: "VHS slashers",
      }
    );
    expect(started.requestId).toBe("req-1");
    const [prompt, options] = research.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(prompt).toContain("VHS slashers");
    expect(options["outputSchema"]).toBeDefined();
    expect(options["model"]).toBe("pro");
    const [file] = options["files"] as { data: string; name: string }[];
    expect(file?.name).toBe("qloo-taste.json");
    expect(
      JSON.parse(Buffer.from(file?.data ?? "", "base64").toString())
    ).toEqual({ qlooTag: "urn:tag:x" });
  });

  it("reads a finished dossier with its citations", async () => {
    const getResearch = vi.fn(
      async () =>
        await Promise.resolve({
          content: JSON.stringify({
            citations: [{ title: "A", url: "https://a.example" }],
            price_band: { high_usd: 30, low_usd: 20, note: "Mostly $25" },
            risks: ["Licensed characters"],
            saturation: "high: thousands of listings",
            why_now: "A remake opens this month.",
          }),
          createdAt: "",
          requestId: "req-1",
          responseTime: 1,
          sources: [
            { title: "B", url: "https://b.example" },
            { title: "A again", url: "https://a.example" },
          ],
          status: "completed",
        })
    );
    const state = await readDossier({ getResearch }, "req-1");
    expect(state.status).toBe("done");
    if (state.status !== "done") {
      return;
    }
    expect(state.dossier.priceBand).toEqual({
      highUsd: 30,
      lowUsd: 20,
      note: "Mostly $25",
    });
    expect(state.dossier.citations.map((c) => c.url)).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("reports pending and failed research", async () => {
    const pending = { requestId: "r", responseTime: 0, status: "in_progress" };
    expect(
      await readDossier(
        { getResearch: async () => await Promise.resolve(pending) },
        "r"
      )
    ).toEqual({ status: "pending" });
    const failed = await readDossier(
      {
        getResearch: async () =>
          await Promise.resolve({ ...pending, status: "failed" }),
      },
      "r"
    );
    expect(failed.status).toBe("failed");
  });

  it("rejects a reply without a why-now answer", () => {
    expect(() => dossierOf("a plain report", [])).toThrow();
  });

  it("fails a finished dossier it can't read instead of waiting on it", async () => {
    const state = await readDossier(
      {
        getResearch: async () =>
          await Promise.resolve({
            content: "A plain report, not JSON.",
            createdAt: "",
            requestId: "r",
            responseTime: 1,
            sources: [],
            status: "completed",
          }),
      },
      "r"
    );
    expect(state.status).toBe("failed");
    expect(state.status === "failed" && state.error).toContain("can't read");
  });

  it("reads a price band Tavily left null as no price", () => {
    const dossier = dossierOf(
      {
        price_band: { high_usd: null, low_usd: null, note: "No prices" },
        why_now: "A remake opens this month.",
      },
      []
    );
    expect(dossier.priceBand).toEqual({
      highUsd: undefined,
      lowUsd: undefined,
      note: "No prices",
    });
  });

  it("reads the report at a glance, one line per answer", () => {
    const dossier = dossierOf(
      {
        summary: {
          price: "Most sell for $24 to $28",
          risks: [
            "Show title is trademarked",
            "",
            "Fading after the finale",
            "a",
            "b",
          ],
          saturation: "Many generic fern tees, few gothic ones",
          saturation_level: " Medium ",
          why_now: "Season 2 premieres next week",
        },
        why_now: "A new season airs this month.",
      },
      []
    );
    expect(dossier.summary).toEqual({
      price: "Most sell for $24 to $28",
      risks: ["Show title is trademarked", "Fading after the finale", "a"],
      saturation: "Many generic fern tees, few gothic ones",
      saturationLevel: "medium",
      whyNow: "Season 2 premieres next week",
    });
  });

  it("keeps a report whose glance is missing or malformed", () => {
    expect(dossierOf({ why_now: "Now." }, []).summary).toBeUndefined();
    const odd = dossierOf({ summary: "not an object", why_now: "Now." }, []);
    expect(odd.whyNow).toBe("Now.");
    expect(odd.summary).toBeUndefined();
    expect(
      dossierOf(
        { summary: { saturation_level: "very high" }, why_now: "Now." },
        []
      ).summary?.saturationLevel
    ).toBeUndefined();
  });
});

// Next, run 783b6885: the evidence read "Dark As Night Shirt Shop the look →
// link in bio https://www. ...".
it("shows a source's title without links, calls to action or boilerplate", () => {
  expect(
    sourceTitle(
      "Dark As Night Shirt Shop the look → link in bio https://www. ...",
      "https://shop.example/dark"
    )
  ).toBe("Dark As Night Shirt");
  expect(sourceTitle("Gothic fern tee | Etsy", "https://etsy.com/l/1")).toBe(
    "Gothic fern tee"
  );
  expect(sourceTitle("Gothic fern tee|Etsy", "https://etsy.com/l/1")).toBe(
    "Gothic fern tee"
  );
  expect(
    sourceTitle("Gothic tee (https://shop.example/item)", "https://a.example")
  ).toBe("Gothic tee");
  // A headline that only starts with a call to action keeps it.
  expect(
    sourceTitle(
      "Buy Now, Pay Later: What Shoppers Need to Know",
      "https://news.example/bnpl"
    )
  ).toBe("Buy Now, Pay Later: What Shoppers Need to Know");
  expect(
    sourceTitle("https://www.example.com/x", "https://example.com/x")
  ).toBe("example.com");
});
