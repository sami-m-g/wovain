import { afterEach, expect, test } from "bun:test";

import { fetchSpend } from "../src/lib/fal-usage.ts";

const realFetch = globalThis.fetch;
const urls: string[] = [];

afterEach(() => {
  globalThis.fetch = realFetch;
  urls.length = 0;
});

const row = (endpoint: string, quantity: number, cost: number) => ({
  cost_total: cost,
  currency: "USD",
  endpoint_id: endpoint,
  quantity,
  unit: "seconds",
});

test("sums what fal billed across pages, by endpoint", async () => {
  const pages = [
    {
      has_more: true,
      next_cursor: "p2",
      time_series: [
        {
          results: [row("fal-ai/minimax-h3-turbo/reference-to-video", 15, 1.2)],
        },
      ],
    },
    {
      has_more: false,
      next_cursor: null,
      time_series: [
        {
          results: [
            row("fal-ai/minimax-h3-turbo/reference-to-video", 15, 1.2),
            row("fal-ai/mmaudio-v2", 30, 0.03),
          ],
        },
      ],
    },
  ];
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      urls.push(input instanceof Request ? input.url : input.toString());
      return await Promise.resolve(Response.json(pages.shift()));
    },
    { preconnect: realFetch.preconnect }
  );
  const spend = await fetchSpend(
    "billing-key",
    new Date("2026-10-19T14:00:00Z")
  );
  expect(spend.totalUsd).toBeCloseTo(2.43, 2);
  expect(spend.byEndpoint).toContainEqual({
    endpointId: "fal-ai/minimax-h3-turbo/reference-to-video",
    quantity: 30,
    unit: "seconds",
    usd: 2.4,
  });
  expect(urls[1]).toContain("cursor=p2");
  expect(urls[0]).toContain("start=2026-10-19T14%3A00%3A00.000Z");
});

test("reports a refused key as an error", async () => {
  globalThis.fetch = Object.assign(
    async () => await Promise.resolve(Response.json({}, { status: 403 })),
    { preconnect: realFetch.preconnect }
  );
  const failed = await fetchSpend("api-key", new Date()).then(
    () => false,
    () => true
  );
  expect(failed).toBe(true);
});
