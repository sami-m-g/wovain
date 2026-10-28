import { afterEach, expect, it, vi } from "vitest";

import { bestMatch, createMetaInterests } from "./meta-interests";
import type { MetaInterest } from "./meta-interests";
import { QLOO_AUDIENCES } from "./qloo-audiences";
import {
  ageRangeOf,
  buildAudienceTargeting,
  leanOf,
  metaTargetingOf,
  pickAudiences,
} from "./targeting";
import type { TargetingDeps } from "./targeting";
import { DecisionTrace } from "./trace";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACTION_AGE = {
  "24_and_younger": 0,
  "25_to_29": 0.43,
  "30_to_34": 0.23,
  "35_to_44": -0.02,
  "45_to_54": -0.28,
  "55_and_older": -0.17,
};

it("maps Qloo's age buckets to the run around the peak", () => {
  // Qloo's own example for the action genre.
  expect(ageRangeOf(ACTION_AGE)).toEqual({
    buckets: ["25_to_29", "30_to_34"],
    max: 34,
    min: 25,
  });
  expect(
    ageRangeOf({ "35_to_44": -0.1, "45_to_54": 0.1, "55_and_older": 0.4 })
  ).toEqual({ buckets: ["45_to_54", "55_and_older"], max: 65, min: 45 });
});

it("leaves ages broad when no bucket leans positive", () => {
  expect(ageRangeOf({ "24_and_younger": -0.1, "25_to_29": 0 })).toBeUndefined();
  expect(ageRangeOf({})).toBeUndefined();
});

it("leans a gender only when one clearly leads", () => {
  expect(leanOf({ female: -0.31, male: 0.31 })).toBe("male");
  expect(leanOf({ female: 0.2, male: -0.2 })).toBe("female");
  expect(leanOf({ female: -0.08, male: 0.08 })).toBe("all");
  expect(leanOf({})).toBe("all");
});

it("keeps audiences that like the brand more than the average does", () => {
  const [street, sneakers, golf, coffee] = QLOO_AUDIENCES;
  if (!(street && sneakers && golf && coffee)) {
    throw new Error("catalog too short");
  }
  const picked = pickAudiences([
    { affinity: 0.92, audience: sneakers },
    { affinity: 0.89, audience: street },
    { affinity: 0.765, audience: golf },
    { affinity: 0.765, audience: coffee },
  ]);
  expect(picked.map(({ audience }) => audience.id)).toEqual([
    sneakers.id,
    street.id,
  ]);
  // A flat answer (no audience data) keeps none.
  expect(
    pickAudiences([
      { affinity: 0.765, audience: golf },
      { affinity: 0.765, audience: coffee },
    ])
  ).toEqual([]);
});

it("builds Meta's spec: countries always, A+A's age minimum cap, gender codes", () => {
  expect(
    metaTargetingOf(["US"], {
      age: {
        buckets: ["30_to_34", "35_to_44"],
        max: 44,
        min: 30,
        source: "qloo",
      },
      gender: { lean: "female", source: "qloo" },
      interests: [
        {
          from: "qloo_audience",
          metaId: "6003139266461",
          metaName: "Street fashion",
          path: [],
          qlooId: "urn:audience:hobbies_and_interests:street_fashion",
          query: "Street Fashion",
        },
      ],
    })
  ).toEqual({
    age_max: 44,
    age_min: 25,
    flexible_spec: [
      { interests: [{ id: "6003139266461", name: "Street fashion" }] },
    ],
    genders: [2],
    geo_locations: { countries: ["US"] },
  });
  expect(metaTargetingOf(["GB"], { interests: [] })).toEqual({
    geo_locations: { countries: ["GB"] },
  });
});

const SHOPPING = ["Interests", "Shopping and fashion"];

const interest = (
  id: string,
  name: string,
  audienceSize?: number,
  path: string[] = []
): MetaInterest => ({
  audienceSize,
  id,
  name,
  path,
});

it("matches an interest only when Meta names it like the query", () => {
  const found = [
    interest("6003000000003", "Golf", 900, ["Interests", "Sports"]),
    interest("6003000000001", "Fashion design", 100, SHOPPING),
    interest("6003000000004", "Fashion week", 5000, SHOPPING),
    interest("6003000000002", "Street fashion", 50, SHOPPING),
  ];
  expect(bestMatch("Street Fashion", found)?.id).toBe("6003000000002");
  // Meta's own order wins over the larger audience.
  expect(bestMatch("Fashion", found)?.id).toBe("6003000000001");
  expect(bestMatch("Tennis", found)).toBeUndefined();
  // Never an ID Meta's search didn't give.
  expect(bestMatch("Golf", [interest("x", "Golf")])).toBeUndefined();
});

it("never matches a broader name outside Meta's apparel categories", () => {
  const court = interest(
    "6003000000020",
    "Supreme Court of the United States",
    90_000_000,
    ["Interests", "Additional interests"]
  );
  expect(bestMatch("Supreme", [court])).toBeUndefined();
  // A broader name with no category path isn't trusted either.
  expect(
    bestMatch("Fashion", [interest("6003000000021", "Fashion design", 100)])
  ).toBeUndefined();
  // The exact name still matches, whatever its category.
  expect(
    bestMatch("Supreme", [court, interest("6003000000022", "Supreme", 10)])?.id
  ).toBe("6003000000022");
});

it("never matches a shorter interest to a longer query", () => {
  expect(
    bestMatch("Street fashion", [
      interest("6003000000030", "Street", 1_000_000, SHOPPING),
    ])
  ).toBeUndefined();
});

it("searches Meta's interests with the app token on the configured Graph", async () => {
  const fetchMock = vi.fn(
    async () =>
      await Promise.resolve(
        Response.json({
          data: [
            {
              audience_size_lower_bound: 1000,
              id: "6003139266461",
              name: "Sneakers",
              path: ["Interests", "Shopping and fashion"],
            },
          ],
        })
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  const found = await createMetaInterests({
    appId: "app",
    appSecret: "secret",
    graphUrl: "https://graph.example/v24.0",
  }).search("Sneakers");
  expect(found).toEqual([
    {
      audienceSize: 1000,
      id: "6003139266461",
      name: "Sneakers",
      path: ["Interests", "Shopping and fashion"],
    },
  ]);
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  const sent = new URL(url);
  expect(sent.origin + sent.pathname).toBe(
    "https://graph.example/v24.0/search"
  );
  expect(sent.searchParams.get("type")).toBe("adinterest");
  expect(sent.searchParams.get("access_token")).toBe("app|secret");
});

it("refuses to search without wovain's Meta app", async () => {
  await expect(
    createMetaInterests({
      appId: undefined,
      appSecret: undefined,
      graphUrl: "https://graph.example/v24.0",
    }).search("Sneakers")
  ).rejects.toThrow(/isn't configured/u);
});

const SNEAKERS = "urn:audience:hobbies_and_interests:sneakerheads";

const fakeDeps = (overrides: Partial<TargetingDeps> = {}) => {
  const error = vi.fn();
  const deps: TargetingDeps = {
    interests: {
      search: vi.fn(
        async (query: string) =>
          await Promise.resolve(
            query === "Sneakers"
              ? [interest("6003000000010", "Sneakers", 5000, SHOPPING)]
              : [
                  interest(
                    "6003000000011",
                    `${query} Court of the United States`,
                    90_000_000,
                    ["Interests", "Additional interests"]
                  ),
                ]
          )
      ),
    },
    log: { error, set: vi.fn() },
    qloo: {
      audienceAffinity: vi.fn(
        async (audienceId: string) =>
          await Promise.resolve(
            audienceId === SNEAKERS ? [0.95, 0.9] : [0.765, 0.765]
          )
      ),
      demographicsOf: vi.fn(
        async (ids: readonly string[]) =>
          await Promise.resolve(
            ids.map((id) => ({
              age: ACTION_AGE,
              gender: { female: -0.31, male: 0.31 },
              id,
            }))
          )
      ),
    },
    ...overrides,
  };
  return { deps, error };
};

const SUPREME = { id: "B1", name: "Supreme", type: "urn:entity:brand" };

it("turns Qloo's audience into Meta targeting and keeps the evidence", async () => {
  const { deps, error } = fakeDeps();
  const trace = new DecisionTrace({ userId: "u1" });
  const result = await buildAudienceTargeting(
    { ...deps, trace },
    { countries: ["US"], entities: [SUPREME] }
  );
  expect(result.targeting).toEqual({
    age_max: 34,
    age_min: 25,
    flexible_spec: [{ interests: [{ id: "6003000000010", name: "Sneakers" }] }],
    genders: [1],
    geo_locations: { countries: ["US"] },
  });
  expect(result.evidence.audiences.map((audience) => audience.id)).toEqual([
    SNEAKERS,
  ]);
  expect(result.evidence.interests[0]).toMatchObject({
    from: "qloo_audience",
    metaId: "6003000000010",
    qlooId: SNEAKERS,
  });
  // Meta's search for "Supreme" finds "Supreme Court of the United States",
  // outside the apparel categories: no interest, kept as unmatched.
  expect(result.evidence.unmatched).toEqual([
    { from: "qloo_entity", qlooId: "B1", query: "Supreme" },
  ]);
  expect(result.persona).toEqual({
    ages: "25-34",
    audiences: ["Sneakerheads"],
    interests: ["Sneakers"],
    lean: "male",
  });
  expect(trace.entries.map((entry) => entry.step)).toEqual(
    expect.arrayContaining([
      "qloo.demographics",
      "qloo.audiences",
      "meta.interests",
      "meta.targeting",
    ])
  );
  expect(error).not.toHaveBeenCalled();
});

it("lets the merchant's own ages and gender win over Qloo's", async () => {
  const { deps } = fakeDeps();
  const result = await buildAudienceTargeting(deps, {
    countries: ["US"],
    entities: [SUPREME],
    override: { ageMax: 40, ageMin: 21, genders: ["female"] },
  });
  expect(result.targeting).toMatchObject({
    age_max: 40,
    age_min: 21,
    genders: [2],
  });
  expect(deps.qloo.demographicsOf).not.toHaveBeenCalled();
});

it("logs a failed step at error level and targets with what is known", async () => {
  const { deps, error } = fakeDeps({
    interests: {
      search: vi.fn(
        async () =>
          await Promise.reject(new Error("Meta targeting search answered 400"))
      ),
    },
  });
  const trace = new DecisionTrace({ userId: "u1" });
  const result = await buildAudienceTargeting(
    { ...deps, trace },
    { countries: ["US"], entities: [SUPREME] }
  );
  expect(result.targeting.flexible_spec).toBeUndefined();
  expect(result.targeting.age_min).toBe(25);
  expect(result.evidence.failed).toEqual(["meta.interests"]);
  expect(error).toHaveBeenCalledWith(expect.any(Error), {
    targeting: { step: "meta.interests" },
  });
  expect(
    trace.entries.find((entry) => entry.step === "meta.interests")?.ok
  ).toBe(false);
});

it("targets countries only when the brand has no Qloo entities", async () => {
  const { deps } = fakeDeps();
  const result = await buildAudienceTargeting(deps, {
    countries: ["CA"],
    entities: [],
  });
  expect(result.targeting).toEqual({ geo_locations: { countries: ["CA"] } });
  expect(deps.interests.search).not.toHaveBeenCalled();
});

it("leaves out audiences Qloo has no score for", async () => {
  const empty = new Set([
    "urn:audience:hobbies_and_interests:street_fashion",
    "urn:audience:hobbies_and_interests:high_fashion",
    SNEAKERS,
  ]);
  const { deps } = fakeDeps();
  deps.qloo.audienceAffinity = vi.fn(
    async (audienceId: string) =>
      await Promise.resolve(empty.has(audienceId) ? [] : [0.765, 0.765])
  );
  const result = await buildAudienceTargeting(deps, {
    countries: ["US"],
    entities: [SUPREME],
  });
  // Every scored audience sits at the same baseline: none stands out.
  expect(result.evidence.audiences).toEqual([]);
  expect(result.evidence.failed).toEqual([]);
});
