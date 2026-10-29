import { expect, it } from "vitest";

import { audienceField, trendCardOf } from "./idea-card";
import type { TrendIdea } from "./trends";
import type { WhoBuys } from "./who-buys";

const research = (overrides: Partial<TrendIdea> = {}): TrendIdea => ({
  qlooTag: "urn:tag:genre:media:middle_grade",
  rank: 1,
  references: [],
  score: 0.4,
  signals: {
    affinity: 0.8,
    ipSafety: 1,
    margin: 0.5,
    marketHits: 3,
    newsHits: 2,
    recency: 0.5,
    relevance: 0.7,
  },
  sources: [{ title: "Middle grade is rising", url: "https://news.example/a" }],
  theme: "Middle Grade",
  ...overrides,
});

const whoBuys = (scope?: "brief" | "idea"): WhoBuys => ({
  audiences: [{ affinity: 0.7, id: "a1", name: "Book Lovers" }],
  brands: [{ affinity: 0.6, id: "b1", name: "Madewell" }],
  buyers: { age: "35_to_44", gender: "female" },
  buyersScope: "brief",
  location: "United States",
  places: [
    { affinity: 0.9, country: "United States", id: "p1", name: "Austin" },
  ],
  scope,
});

it("says why each section of an old idea is empty, never leaves it out", () => {
  const card = trendCardOf(research());
  expect(card).toMatchObject({
    audience: { reason: "not_read", status: "unavailable" },
    competition: { reason: "not_read", status: "unavailable" },
    make: { reason: "not_read", status: "unavailable" },
    origin: "trends",
    why: { status: "ok", value: { demand: { reason: "not_read" } } },
  });
});

it("fills every section of a gated, named idea", () => {
  const card = trendCardOf(
    research({
      proof: {
        gaps: ["cozy"],
        market: { bestsellers: 2, listings: [], reviews: 300 },
        proven: true,
        supply: { citations: [], count: 3, level: "low", sampled: 20 },
      },
      words: {
        buyer: "for kids who read under the covers",
        concept: "A flashlight-reading fox on a soft tee.",
        occasion: "a birthday gift",
        status: "ok",
        style: "storybook ink",
        title: "Flashlight-reading fox",
        whyNow: "Readers already buy it.",
      },
    }),
    { whoBuys: whoBuys("idea") }
  );
  expect(card.make).toMatchObject({
    status: "ok",
    value: {
      concept: "A flashlight-reading fox on a soft tee.",
      title: "Flashlight-reading fox",
    },
  });
  expect(card.competition).toMatchObject({
    status: "ok",
    value: { gaps: ["cozy"], level: "sweet-spot", listings: 3 },
  });
  expect(card.why).toMatchObject({
    status: "ok",
    value: {
      demand: {
        status: "ok",
        value: { ads: { reason: "not_connected" }, proven: true },
      },
      qlooTag: { name: "Middle Grade" },
    },
  });
  expect(card.audience).toMatchObject({
    status: "ok",
    value: { ages: ["35-44"], agesScope: "brief", scope: "idea" },
  });
});

it("marks the title unavailable with the reason when the words failed twice", () => {
  const card = trendCardOf(
    research({ words: { reason: "ungrounded", status: "unavailable" } })
  );
  expect(card.make).toStrictEqual({
    reason: "ungrounded",
    status: "unavailable",
  });
});

it("reads buyers kept before scopes as the brief's", () => {
  expect(audienceField(whoBuys())).toMatchObject({
    value: { scope: "brief" },
  });
});
