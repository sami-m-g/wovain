import { expect, it, vi } from "vitest";

import type { QlooRanked, WhoSignals } from "./qloo";
import { DecisionTrace } from "./trace";
import {
  countryOf,
  DEFAULT_LOCATION,
  familyOf,
  markets,
  targetable,
  whoBuys,
} from "./who-buys";
import type { WhoBuysDeps } from "./who-buys";

const ranked = (prefix: string, where?: (index: number) => string) =>
  Array.from({ length: 6 }, (_, index): QlooRanked => ({
    affinity: 0.9 - index * 0.1,
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    ...(where !== undefined && { where: where(index) }),
  }));

const keyOf = (signals: WhoSignals) =>
  [...(signals.entities ?? []), ...(signals.tags ?? [])].join("+");

// A Qloo whose answers follow the signals, as the real one's do.
const qlooFake = (failing?: "audiences" | "brands" | "places") => {
  const answer = async <T>(name: string, value: T) => {
    if (failing === name) {
      throw new Error(`Qloo ${name} answered 503`);
    }
    return await Promise.resolve(value);
  };
  return {
    audiencesOf: vi.fn(
      async (signals: WhoSignals) =>
        await answer(
          "audiences",
          ranked(
            `${keyOf(signals)} audience`,
            () => "x (Hobbies And Interests)"
          )
        )
    ),
    demographicsOf: vi.fn(
      async (ids: readonly string[]) =>
        await Promise.resolve(
          ids.map((id) => ({
            age: { "25_to_29": 0.5, "30_to_34": 0.2 },
            gender: { female: 0.4, male: -0.3 },
            id,
          }))
        )
    ),
    fashionBrandsOf: vi.fn(
      async (signals: WhoSignals) =>
        await answer("brands", ranked(`${keyOf(signals)} brand`))
    ),
    placesOf: vi.fn(
      async (signals: WhoSignals, location: string) =>
        await answer(
          "places",
          ranked(
            `${keyOf(signals)} city`,
            (index) =>
              `City ${index}, County, ${location === DEFAULT_LOCATION ? "France (terres)" : location}`
          )
        )
    ),
  };
};

const depsWith = (overrides: Partial<WhoBuysDeps> = {}): WhoBuysDeps => ({
  qloo: qlooFake(),
  ...overrides,
});

it("names who buys and where from Qloo alone", async () => {
  const result = await whoBuys(depsWith(), { entities: ["Q-goth"] });
  expect(result.buyers).toMatchObject({ age: "25_to_29", gender: "female" });
  expect(result.audiences).toHaveLength(5);
  expect(result.audiences[0]).toMatchObject({
    family: "Hobbies And Interests",
    name: "Q-goth audience 0",
  });
  expect(result.places).toHaveLength(5);
  expect(result.places[0]?.country).toBe("France");
  expect(result.brands).toHaveLength(3);
  expect(result.location).toBe(DEFAULT_LOCATION);
});

it("gives different ideas different buyers", async () => {
  const goth = await whoBuys(depsWith(), { entities: ["Q-goth"] });
  const garden = await whoBuys(depsWith(), { tags: ["urn:tag:genre:garden"] });
  expect(goth.places.map((one) => one.name)).not.toStrictEqual(
    garden.places.map((one) => one.name)
  );
  expect(goth.brands[0]?.name).not.toBe(garden.brands[0]?.name);
});

it("reads a tag-only idea without demographics", async () => {
  const qloo = qlooFake();
  const result = await whoBuys(depsWith({ qloo }), {
    tags: ["urn:tag:genre:garden"],
  });
  expect(qloo.demographicsOf).not.toHaveBeenCalled();
  expect(result.buyers.age).toBeUndefined();
  expect(result.audiences.length).toBeGreaterThan(0);
});

it("looks for the buyers within the country asked for", async () => {
  const qloo = qlooFake();
  const result = await whoBuys(
    depsWith({ qloo }),
    { entities: ["Q-goth"] },
    "Canada"
  );
  expect(qloo.placesOf.mock.calls[0]?.[1]).toBe("Canada");
  expect(result.places[0]?.country).toBe("Canada");
});

it.each(["audiences", "brands", "places"] as const)(
  "never guesses without Qloo: a %s failure throws",
  async (failing) => {
    await expect(
      whoBuys(depsWith({ qloo: qlooFake(failing) }), { entities: ["Q-goth"] })
    ).rejects.toMatchObject({
      message: "We couldn't reach our taste data to say who buys this",
    });
  }
);

it("refuses an idea with no Qloo data", async () => {
  await expect(whoBuys(depsWith(), {})).rejects.toMatchObject({
    message: "This idea has no Qloo data to read its buyers from",
  });
});

it("records every value with its Qloo source in the decision trace", async () => {
  const trace = new DecisionTrace({ userId: "user-1" });
  const result = await whoBuys(depsWith({ trace }), { entities: ["Q-goth"] });
  const [entry] = trace.entries;
  expect(entry?.step).toBe("who.buys");
  const ids = new Set(entry?.sources.map((source) => source.id));
  for (const one of [...result.audiences, ...result.places, ...result.brands]) {
    expect(ids.has(one.id)).toBe(true);
  }
});

it("reads the family and the country from Qloo's names", () => {
  expect(familyOf("Tattoos (Hobbies And Interests)")).toBe(
    "Hobbies And Interests"
  );
  expect(familyOf()).toBeUndefined();
  expect(
    countryOf("Salem, Essex County, Massachusetts, United States of America")
  ).toBe("United States of America");
  expect(countryOf("Torcy, Île-de-France, France (terres)")).toBe("France");
});

it("leaves out audiences no ad may target", () => {
  const audiences = targetable([
    { affinity: 0.97, id: "a", name: "LGBTQ", where: "LGBTQ (Communities)" },
    {
      affinity: 0.96,
      id: "b",
      name: "Tattoos",
      where: "Tattoos (Hobbies And Interests)",
    },
    { affinity: 0.95, id: "c", name: "Vote", where: "Vote (Politics)" },
  ]);
  expect(audiences.map((one) => one.name)).toStrictEqual(["Tattoos"]);
});

it("ranks a city with many fans above a village where a few love it", () => {
  const places = markets([
    { affinity: 0.8, id: "village", name: "Village", popularity: 0.2 },
    { affinity: 0.7, id: "city", name: "City", popularity: 0.99 },
  ]);
  expect(places.map((one) => one.name)).toStrictEqual(["City", "Village"]);
});

it("reads a tag-only idea's buyers from its tag, its age from the brief, and says so", async () => {
  const qloo = qlooFake();
  const result = await whoBuys(
    depsWith({ qloo }),
    { tags: ["urn:tag:genre:garden"] },
    DEFAULT_LOCATION,
    { demographics: ["Q-brief"], scope: "idea" }
  );
  expect(qloo.demographicsOf).toHaveBeenCalledWith(["Q-brief"], undefined);
  expect(qloo.placesOf.mock.calls[0]?.[0]).toStrictEqual({
    tags: ["urn:tag:genre:garden"],
  });
  expect(result).toMatchObject({ buyersScope: "brief", scope: "idea" });
  expect(result.buyers.age).toBe("25_to_29");
});

it("leaves out audiences about money, jobs or politics whatever their family", () => {
  const audiences = targetable([
    {
      affinity: 0.9,
      id: "a",
      name: "Angel Start Up Investing",
      where: "Angel Start Up Investing (Lifestyle)",
    },
    { affinity: 0.8, id: "b", name: "Sales Professional" },
    { affinity: 0.7, id: "c", name: "Political Junkie" },
    { affinity: 0.6, id: "d", name: "K-Drama Fans" },
  ]);
  expect(audiences.map((one) => one.name)).toStrictEqual(["K-Drama Fans"]);
});
