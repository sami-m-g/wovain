import { afterEach, expect, test } from "bun:test";

import { videoModels } from "@wovain-foss/shared/video-models";

import { createVideoPricing } from "../src/lib/fal-pricing.ts";
import { restoreFetch, stubFetch } from "./helpers.ts";

let calls: { authorization: string | null; url: string }[] = [];

const answer = (body: unknown, status = 200) => {
  calls = [];
  stubFetch(async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      authorization: new Headers(init?.headers).get("authorization"),
      url: input instanceof Request ? input.url : input.toString(),
    });
    return await Promise.resolve(Response.json(body, { status }));
  });
};

afterEach(() => {
  restoreFetch();
});

test("uses fal's live per-second prices and keeps list prices for other units", async () => {
  answer({
    prices: [
      {
        endpoint_id: videoModels["h3-max-turbo"].endpointId,
        unit: "seconds",
        unit_price: 0.02,
      },
      {
        endpoint_id: videoModels["h3-max"].endpointId,
        unit: "videos",
        unit_price: 0.4,
      },
    ],
  });
  const prices = await createVideoPricing("key-1")();
  expect(prices["h3-max-turbo"]).toEqual({ source: "fal", usdPerSecond: 0.02 });
  expect(prices["h3-max"]).toEqual({ source: "list", usdPerSecond: 0.0325 });
  expect(calls[0]?.authorization).toBe("Key key-1");
  expect(calls[0]?.url).toContain(
    "endpoint_id=minimax%2Fh3-max-turbo%2Fimage-to-video"
  );
});

test("falls back to list prices without a key, on errors, and caches a day", async () => {
  answer({ prices: [] });
  const keyless = await createVideoPricing()();
  expect(keyless["kling-v3-standard"].source).toBe("list");
  expect(calls).toHaveLength(0);

  answer({ error: "nope" }, 401);
  const failed = await createVideoPricing("bad")();
  expect(failed["h3-max-turbo"].source).toBe("list");

  answer({ prices: [] });
  const pricing = createVideoPricing("key-1");
  await pricing();
  await pricing();
  expect(calls).toHaveLength(1);
});
