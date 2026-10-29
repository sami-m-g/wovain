import { HttpResponse, http } from "msw";

import { fal } from "./fal.ts";
import { nemotron } from "./nemotron.ts";

// Fixed answers from the providers the server calls, at their HTTP
// boundary. Each is the smallest reply the app's own parsers accept
// (packages/core/src/qloo.ts, trends.ts and the providers' SDKs).

const DAY_MS = 86_400_000;
const recent = () => new Date(Date.now() - DAY_MS).toISOString();

// Qloo's taste graph: one entity, three tags and their audience.
const QLOO_TAGS = [
  "Cottagecore",
  "Botanical illustration",
  "Mushroom foraging",
];
const qlooInsights = {
  results: {
    demographics: [
      {
        entity_id: "E1",
        query: {
          age: { "24_and_younger": 0.3, "25_to_29": 0.2 },
          gender: { female: 0.3, male: -0.3 },
        },
      },
    ],
    entities: [
      {
        entity_id: "E1",
        name: "Studio Ghibli",
        query: { affinity: 0.9 },
        types: ["urn:entity:movie"],
      },
    ],
    tags: QLOO_TAGS.map((name, index) => ({
      name,
      query: { affinity: 0.95 - index * 0.05 },
      tag_id: `urn:tag:genre:media:${name.toLowerCase().replaceAll(" ", "_")}`,
    })),
  },
  success: true,
};

// Tavily: news for every query and two priced marketplace listings.
const tavilySearch = (query: string, topic: unknown) => ({
  answer: `Why ${query} matters now`,
  images: [],
  query,
  response_time: 0.1,
  results:
    topic === "news"
      ? [
          {
            content: `${query} is trending this month.`,
            published_date: recent(),
            score: 0.9,
            title: `${query} is trending`,
            url: `https://news.example.com/${encodeURIComponent(query)}`,
          },
        ]
      : [1, 2].map((listing) => ({
          content: `Bestseller. Price $${28 + listing}.00 · 1,240 reviews`,
          published_date: recent(),
          score: 0.8,
          title: `${query.replaceAll('"', "")} Tee ${listing}`,
          url: `https://www.etsy.com/listing/${listing}`,
        })),
});

// Polar (sandbox): no discount matches a code, so any code is invalid.
const POLAR = "https://sandbox-api.polar.sh/v1";

export const handlers = [
  // Usage events for the credits meter.
  http.post(`${POLAR}/events/ingest`, async ({ request }) => {
    const { events } = (await request.json()) as { events: unknown[] };
    return HttpResponse.json({ inserted: events.length });
  }),
  http.get(`${POLAR}/discounts/`, () =>
    HttpResponse.json({
      items: [],
      pagination: { max_page: 1, total_count: 0 },
    })
  ),
  nemotron,
  ...fal,
  http.get("https://hackathon.api.qloo.com/search", () =>
    HttpResponse.json({ results: qlooInsights.results.entities })
  ),
  // Tag search reads the same `results.tags` as insights.
  http.get("https://hackathon.api.qloo.com/v2/tags", () =>
    HttpResponse.json(qlooInsights)
  ),
  http.get("https://hackathon.api.qloo.com/v2/insights", () =>
    HttpResponse.json(qlooInsights)
  ),
  http.post("https://api.tavily.com/search", async ({ request }) => {
    const body = (await request.json()) as { query: string; topic?: unknown };
    return HttpResponse.json(tavilySearch(body.query, body.topic));
  }),
  http.post("https://api.tavily.com/extract", async ({ request }) => {
    const body = (await request.json()) as { urls: string[] };
    return HttpResponse.json({
      failed_results: [],
      response_time: 0.1,
      results: body.urls.map((url) => ({
        raw_content: "Classic T-Shirt $29.00",
        url,
      })),
    });
  }),
];
