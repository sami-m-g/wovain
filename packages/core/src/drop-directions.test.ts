import { afterEach, expect, it, vi } from "vitest";
import type { z } from "zod";

import { MAX_DIRECTIONS, suggestDirections } from "./drop-directions";
import type {
  DirectionBrand,
  DirectionEvent,
  DirectionDeps,
  DirectionRequest,
} from "./drop-directions";
import type { Ask, Nemotron } from "./nemotron";
import type { InsightsQuery, QlooInsight } from "./qloo";
import { DecisionTrace } from "./trace";

afterEach(() => {
  vi.restoreAllMocks();
});

const lastPart = (id: string) => id.split(":").at(-1) ?? id;

// A Qloo whose answers depend on the signals, as the real one's do: what
// rises is named after the brand's references or the audience.
const insightFor = (query: InsightsQuery): QlooInsight[] => {
  const input = [...(query.audiences ?? []), ...(query.entities ?? [])]
    .map(lastPart)
    .join("+");
  return Array.from({ length: 4 }, (_, index) => ({
    affinity: 0.9 - index * 0.1,
    id: `${input}-${query.type}-${index}`,
    name: `${input} ${query.type} ${index}`,
    popularity: 0.6,
    type: query.type,
  }));
};

const qlooFake = (fail = false) => ({
  insights: vi.fn(async (query: InsightsQuery) => {
    if (fail) {
      throw new Error("Qloo /v2/insights answered 503");
    }
    return await Promise.resolve(insightFor(query));
  }),
  // Each rising entity carries a tag its source shares, one of its own,
  // and "Cottagecore", which a brand with that niche gets no new direction
  // from.
  tagsFor: vi.fn(async (ids: readonly string[]) => {
    const [entity = ""] = ids;
    const [source = ""] = entity.split("-");
    return await Promise.resolve([
      { affinity: 0.9, id: `urn:tag:genre:${source}`, name: `${source} wave` },
      { affinity: 0.8, id: `urn:tag:genre:${entity}`, name: `${entity} genre` },
      { affinity: 0.7, id: "urn:tag:genre:niche", name: "Cottagecore" },
    ]);
  }),
});

// News for every theme; marketplace listings only for themes named
// "crowded wave", ten near-identical ones.
const tavilyFake = () =>
  ({
    search: vi.fn(async (query: string) => {
      if (query.endsWith("t-shirt")) {
        const theme = query.replaceAll('"', "").replace(" t-shirt", "");
        return await Promise.resolve({
          results: theme.startsWith("crowded wave")
            ? Array.from({ length: 10 }, (_, index) => ({
                content: `${theme} t-shirt`,
                score: 0.9,
                title: `${theme} t-shirt ${index}`,
                url: `https://www.etsy.com/listing/${index}`,
              }))
            : [],
        });
      }
      return await Promise.resolve({
        results: [
          {
            content: `${query} is rising`,
            score: 0.8,
            title: `${query} story`,
            url: `https://news.example.com/${encodeURIComponent(query)}`,
          },
        ],
      });
    }),
  }) as unknown as DirectionDeps["tavily"];

// Words that follow the facts given, as the real writer is told to.
const writeWords: Nemotron = async <T extends z.ZodType>({
  prompt,
  schema,
}: Ask<T>) => {
  const { directions } = JSON.parse(prompt) as {
    directions: { key: string; rising: string[]; theme: string }[];
  };
  return await Promise.resolve(
    schema.parse({
      directions: directions.map((one) => ({
        brief: `A drop about ${one.theme} for these buyers`,
        key: one.key,
        title: one.theme.slice(0, 60),
        whyNow: `Rising with fans of ${one.rising[0] ?? "these shows"}.`,
      })),
    })
  );
};

const failingWords: Nemotron = async () =>
  await Promise.reject(new Error("Nemotron timed out"));

const depsWith = (overrides: Partial<DirectionDeps> = {}): DirectionDeps => ({
  ask: writeWords,
  locale: "en",
  qloo: qlooFake(),
  tavily: tavilyFake(),
  ...overrides,
});

const brandFor = (key: string, niche: string): DirectionBrand => ({
  ageAffinity: { "25_to_29": 0.4, "35_to_44": 0.1 },
  entities: [{ id: key, name: `${key} band` }],
  genders: ["female"],
  niches: [niche],
  voice: "warm, never crude",
});

const request = (brand?: DirectionBrand, round = 0): DirectionRequest => ({
  brand,
  round,
  salt: "user-1",
});

const themesOf = (result: Awaited<ReturnType<typeof suggestDirections>>) =>
  result.directions.map((one) => one.theme);

it("suggests what to sell without a brand, one Qloo audience per direction", async () => {
  const qloo = qlooFake();
  const result = await suggestDirections(depsWith({ qloo }), request());
  expect(result.scope).toBe("open");
  expect(result.directions.length).toBeGreaterThanOrEqual(3);
  expect(result.directions.length).toBeLessThanOrEqual(MAX_DIRECTIONS);
  const audiences = result.directions.map((one) => one.evidence.audience);
  expect(new Set(audiences).size).toBe(audiences.length);
  for (const [query] of qloo.insights.mock.calls) {
    expect(query.audiences?.[0]).toMatch(/^urn:audience:/u);
    expect(query.trends).toBe("high");
  }
});

it("gives other niches on Show me others", async () => {
  const first = await suggestDirections(depsWith(), request(undefined, 0));
  const second = await suggestDirections(depsWith(), request(undefined, 1));
  expect(themesOf(first)).not.toStrictEqual(themesOf(second));
});

it("keeps a brand's directions within the brand, and different brands differ", async () => {
  const gothic = await suggestDirections(
    depsWith(),
    request(brandFor("goth", "Gothic romance"))
  );
  const garden = await suggestDirections(
    depsWith(),
    request(brandFor("garden", "Plant care"))
  );
  expect(gothic.scope).toBe("brand");
  expect(gothic.directions.length).toBeGreaterThanOrEqual(3);
  expect(themesOf(gothic)).not.toStrictEqual(themesOf(garden));
  expect(gothic.directions[0]?.theme).not.toBe(garden.directions[0]?.theme);
  for (const direction of gothic.directions) {
    expect(
      direction.evidence.rising.every((one) => one.id.startsWith("goth"))
    ).toBe(true);
  }
});

it("reads the brand's references, age and gender, biased to what is rising", async () => {
  const qloo = qlooFake();
  await suggestDirections(
    depsWith({ qloo }),
    request(brandFor("goth", "Gothic"))
  );
  const [query] = qloo.insights.mock.calls[0] ?? [];
  expect(query).toMatchObject({
    age: "25_to_29",
    entities: ["goth"],
    gender: "female",
    trends: "high",
  });
});

it("treats a brand with no Qloo reference as no brand", async () => {
  const result = await suggestDirections(
    depsWith(),
    request({ entities: [], niches: ["Gothic"] })
  );
  expect(result.scope).toBe("open");
  expect(result.directions.length).toBeGreaterThan(0);
});

it("ranks a crowded theme below an open one", async () => {
  // The brand's shared tag is crowded on the marketplaces.
  const result = await suggestDirections(
    depsWith(),
    request(brandFor("crowded", "Gothic"))
  );
  const crowded = result.directions.find((one) => one.theme === "crowded wave");
  expect(crowded?.evidence.saturation?.level).toBe("high");
  expect(result.directions.at(-1)?.theme).toBe("crowded wave");
});

it("cites the rising Qloo entities and the news behind each direction", async () => {
  const result = await suggestDirections(
    depsWith(),
    request(brandFor("goth", "Gothic"))
  );
  for (const direction of result.directions) {
    expect(direction.evidence.rising.length).toBeGreaterThan(0);
    expect(direction.evidence.momentum?.sources[0]?.url).toMatch(
      /^https:\/\/news\.example\.com\//u
    );
    expect(direction.whyNow).not.toBe("");
  }
});

it("leaves out a tag that only restates the brand's niche", async () => {
  const result = await suggestDirections(
    depsWith(),
    request(brandFor("goth", "Cottagecore"))
  );
  expect(themesOf(result)).not.toContain("Cottagecore");
});

it.each([
  ["without a brand", undefined],
  ["with a brand", brandFor("goth", "Gothic")],
])(
  "never suggests without Qloo: a Qloo failure throws (%s)",
  async (_, brand) => {
    const prompts: string[] = [];
    const ask: Nemotron = async (args) => {
      prompts.push(args.prompt);
      return await writeWords(args);
    };
    const tavily = tavilyFake();
    await expect(
      suggestDirections(
        depsWith({ ask, qloo: qlooFake(true), tavily }),
        request(brand)
      )
    ).rejects.toMatchObject({ message: "We couldn't reach our taste data" });
    expect(prompts).toStrictEqual([]);
    expect(tavily.search).not.toHaveBeenCalled();
  }
);

it("keeps Qloo's directions when the words fail", async () => {
  const result = await suggestDirections(
    depsWith({ ask: failingWords }),
    request()
  );
  expect(result.directions.length).toBeGreaterThan(0);
  for (const direction of result.directions) {
    expect(direction.title).toBe(direction.theme);
    expect(direction.brief).toContain(direction.theme);
  }
});

it("records the directions in the decision trace", async () => {
  const trace = new DecisionTrace({ userId: "user-1" });
  await suggestDirections(depsWith({ trace }), request());
  expect(trace.entries.map((entry) => entry.step)).toStrictEqual([
    "directions.qloo",
    "directions.rank",
  ]);
});

it("announces each step and each direction as soon as it is written", async () => {
  const events: DirectionEvent[] = [];
  const result = await suggestDirections(
    depsWith({ onEvent: (event) => events.push(event) }),
    request()
  );
  const steps = events.flatMap((event) =>
    event.kind === "step" ? [event.step] : []
  );
  expect(steps).toStrictEqual(["qloo", "listings", "words"]);
  const streamed = events.flatMap((event) =>
    event.kind === "direction" ? [event.direction.key] : []
  );
  // Each card is sent twice: with its facts, then with its words.
  expect(streamed).toHaveLength(result.directions.length * 2);
  expect([...new Set(streamed)].toSorted()).toStrictEqual(
    result.directions.map((one) => one.key).toSorted()
  );
  // Words come after the checks: the first card follows the words step.
  expect(
    events.findIndex((event) => event.kind === "direction")
  ).toBeGreaterThan(
    events.findIndex((event) => event.kind === "step" && event.step === "words")
  );
});
