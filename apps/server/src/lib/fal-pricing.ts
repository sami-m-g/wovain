import {
  listVideoPrices,
  videoModelIds,
  videoModels,
} from "@wovain/shared/video-models";
import type { VideoPrices } from "@wovain/shared/video-models";
import { z } from "zod";

// fal's Platform API returns current list prices (the same data its MCP's
// get_pricing shows). It needs FAL_KEY; without one, or if fal is unreachable,
// the cards fall back to the list prices recorded in video-models.ts.
const PRICING_URL = "https://api.fal.ai/v1/models/pricing";
// Short enough that a fal price change shows up within the half hour.
const CACHE_MS = 30 * 60 * 1000;

const pricingSchema = z.object({
  prices: z.array(
    z.object({
      endpoint_id: z.string(),
      unit: z.string(),
      unit_price: z.number().nonnegative(),
    })
  ),
});

const fetchLivePrices = async (falKey: string): Promise<VideoPrices> => {
  const url = new URL(PRICING_URL);
  for (const id of videoModelIds) {
    url.searchParams.append("endpoint_id", videoModels[id].endpointId);
  }
  const response = await fetch(url, {
    headers: { authorization: `Key ${falKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`fal pricing answered ${response.status}`);
  }
  const { prices } = pricingSchema.parse(await response.json());
  const byEndpoint = new Map(prices.map((price) => [price.endpoint_id, price]));
  const result = listVideoPrices();
  for (const id of videoModelIds) {
    const live = byEndpoint.get(videoModels[id].endpointId);
    // Only per-second prices map onto a clip; anything else keeps the list price.
    if (live?.unit === "seconds") {
      result[id] = { source: "fal", usdPerSecond: live.unit_price };
    }
  }
  return result;
};

export const createVideoPricing = (falKey?: string) => {
  let cached: { at: number; prices: VideoPrices } | undefined;
  return async (): Promise<VideoPrices> => {
    if (falKey === undefined) {
      return listVideoPrices();
    }
    if (cached !== undefined && Date.now() - cached.at < CACHE_MS) {
      return cached.prices;
    }
    try {
      const prices = await fetchLivePrices(falKey);
      cached = { at: Date.now(), prices };
      return prices;
    } catch (error) {
      console.error(
        "wovain: fal pricing unavailable, using list prices",
        error
      );
      return listVideoPrices();
    }
  };
};

export type VideoPricing = ReturnType<typeof createVideoPricing>;
