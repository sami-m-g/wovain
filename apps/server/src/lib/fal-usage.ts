import { z } from "zod";

// What fal actually billed, from its usage API (GET /v1/models/usage). It
// needs a Billing-preset key (billing:usage:read), kept apart from FAL_KEY so
// the server's working key never carries billing access.
const USAGE_URL = "https://api.fal.ai/v1/models/usage";

const usageSchema = z.object({
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
  time_series: z
    .array(
      z.object({
        results: z.array(
          z.object({
            cost_total: z.number(),
            currency: z.string(),
            endpoint_id: z.string(),
            quantity: z.number(),
            unit: z.string(),
          })
        ),
      })
    )
    .default([]),
});

export interface Spend {
  byEndpoint: {
    endpointId: string;
    quantity: number;
    unit: string;
    usd: number;
  }[];
  since: string;
  totalUsd: number;
}

// Not filtered by endpoint: fal records some jobs under internal names (an
// H3 Max Reference job shows as fal-ai/minimax-h3-turbo/reference-to-video).
export const fetchSpend = async (
  billingKey: string,
  since: Date
): Promise<Spend> => {
  const totals = new Map<
    string,
    { quantity: number; unit: string; usd: number }
  >();
  let cursor: string | null = null;
  do {
    const url = new URL(USAGE_URL);
    url.searchParams.set("start", since.toISOString());
    url.searchParams.set("expand", "time_series");
    url.searchParams.set("bound_to_timeframe", "false");
    if (cursor !== null) {
      url.searchParams.set("cursor", cursor);
    }
    // oxlint-disable-next-line no-await-in-loop -- pages follow one another
    const response = await fetch(url, {
      headers: { authorization: `Key ${billingKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`fal usage answered ${response.status}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- pages follow one another
    const page = usageSchema.parse(await response.json());
    for (const row of page.time_series.flatMap((bucket) => bucket.results)) {
      const current = totals.get(row.endpoint_id) ?? {
        quantity: 0,
        unit: row.unit,
        usd: 0,
      };
      totals.set(row.endpoint_id, {
        quantity: current.quantity + row.quantity,
        unit: row.unit,
        usd: current.usd + row.cost_total,
      });
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor !== null);
  const byEndpoint = [...totals].map(([endpointId, total]) => ({
    endpointId,
    ...total,
  }));
  return {
    byEndpoint,
    since: since.toISOString(),
    totalUsd: byEndpoint.reduce((sum, row) => sum + row.usd, 0),
  };
};
