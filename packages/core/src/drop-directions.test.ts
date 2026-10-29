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
import { fitOutcomeModel } from "./outcomes";
import type { DesignOutcome } from "./outcomes";
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
      // Etsy, Amazon and Redbubble: a bestseller for every theme except
      // the ones named "unsold".
      if (query.endsWith('" shirt')) {
        const theme = query.replaceAll('"', "").replace(" shirt", "");
        return await Promise.resolve({
          results: theme.includes("unsold")
            ? []
            : [
                {
                  content: `Bestseller. 1,240 reviews. ${theme} graphic tee`,
                  score: 0.9,
                  title: `${theme} shirt`,
                  url: `https://www.etsy.com/listing/${encodeURIComponent(theme)}`,
                },
              ],
        });
      }
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

// The idea_words agent: a readable title from the tag, no number.
const nameIdeas: Nemotron = async <T extends z.ZodType>({
  prompt,
  schema,
}: Ask<T>) => {
  const { evidence } = JSON.parse(prompt) as {
    evidence: { qloo: { tag: string } };
  };
  return await Promise.resolve(
    schema.parse({
      buyer: "for fans of the night",
      concept: `A line-art crest about ${evidence.qloo.tag} on a soft tee.`,
      occasion: "identity tee",
      style: "line art",
      title: `Line-art crest of ${evidence.qloo.tag}`.slice(0, 60),
      whyNow: "Shoppers already buy it on the marketplaces.",
    })
  );
};

const failingWords: Nemotron = async () =>
  await Promise.reject(new Error("Nemotron timed out"));

const depsWith = (overrides: Partial<DirectionDeps> = {}): DirectionDeps => ({
  ask: nameIdeas,
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
  const themes = result.directions.map((one) => one.theme);
  expect(result.directions[0]?.evidence.saturation?.level).not.toBe("high");
  const at = themes.indexOf("crowded wave");
  expect(at === -1 || at === themes.length - 1).toBe(true);
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
      return await nameIdeas(args);
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

it("never shows a direction with its raw tag when the words fail", async () => {
  const events: DirectionEvent[] = [];
  const result = await suggestDirections(
    depsWith({ ask: failingWords, onEvent: (event) => events.push(event) }),
    request()
  );
  expect(result.directions).toStrictEqual([]);
  expect(events.some((event) => event.kind === "direction")).toBe(false);
});

it("records the directions in the decision trace", async () => {
  const trace = new DecisionTrace({ userId: "user-1" });
  await suggestDirections(depsWith({ trace }), request());
  const steps = trace.entries.map((entry) => entry.step);
  expect(steps.filter((step) => step.startsWith("directions."))).toStrictEqual([
    "directions.qloo",
    "directions.rank",
  ]);
  // Every direction shown was named by the idea_words agent.
  expect(steps).toContain("ideas.words");
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
  // Each card is sent once, named: never with its raw tag first.
  expect(new Set(streamed).size).toBe(streamed.length);
  for (const direction of result.directions) {
    expect(streamed).toContain(direction.key);
  }
  // Words come after the checks: the first card follows the words step.
  expect(
    events.findIndex((event) => event.kind === "direction")
  ).toBeGreaterThan(
    events.findIndex((event) => event.kind === "step" && event.step === "words")
  );
});

it("drops a theme nothing proves sells, and says how many", async () => {
  const result = await suggestDirections(
    depsWith(),
    request(brandFor("unsold", "Cottagecore"))
  );
  expect(result.directions).toStrictEqual([]);
  expect(result.dropped).toBeGreaterThan(0);
});

it("ranks on proof: shops advertising for weeks lead", async () => {
  const day = 24 * 60 * 60;
  const now = Date.now() / 1000;
  const adLibrary = vi.fn(async (theme: string) => {
    const long = theme.endsWith("wave");
    return await Promise.resolve({
      advertisers: long ? 6 : 0,
      evergreen: long ? 4 : 0,
      longestDays: long ? Math.round((now - (now - 45 * day)) / day) : 0,
      samples: [],
      validated: long ? 5 : 0,
    });
  });
  const result = await suggestDirections(
    depsWith({ adLibrary }),
    request(brandFor("goth", "Gothic"))
  );
  expect(adLibrary).toHaveBeenCalled();
  expect(result.directions[0]?.theme).toBe("goth wave");
  expect(result.directions[0]?.evidence.demand?.ads?.evergreen).toBe(4);
});

it("writes each proven theme as a concept: design, buyer and occasion", async () => {
  const result = await suggestDirections(depsWith(), request());
  for (const direction of result.directions) {
    expect(direction.buyer).toMatch(/^for /u);
    expect(direction.occasion).not.toBe("");
    expect(direction.evidence.demand?.proven).toBe(true);
  }
});

const gatedDeps = (overrides: Partial<DirectionDeps> = {}) =>
  depsWith({ ask: nameIdeas, gate: true, ...overrides });

it("with the evidence gate, drops a saturated theme and records why", async () => {
  const trace = new DecisionTrace({ userId: "u1" });
  const result = await suggestDirections(
    gatedDeps({ trace }),
    request(brandFor("crowded", "Gothic"))
  );
  expect(themesOf(result)).not.toContain("crowded wave");
  const rank = trace.entries.find((entry) => entry.step === "directions.rank");
  expect(rank?.output).toMatchObject({
    gate: expect.arrayContaining([
      expect.objectContaining({ reason: "saturated", theme: "crowded wave" }),
    ]),
  });
});

// The founder's "What to sell now" on next (2026-10-29): no theme proved
// demand, the gate dropped them all and the step said Qloo found nothing.
it("with the evidence gate and no theme proven, shows Qloo's themes with their caution", async () => {
  const trace = new DecisionTrace({ userId: "u1" });
  const result = await suggestDirections(
    gatedDeps({ trace }),
    request(brandFor("unsold", "Cottagecore"))
  );
  expect(result.directions.length).toBeGreaterThan(0);
  expect(result.unconfirmed).toBe(true);
  expect(
    result.directions.every((one) => one.caution === "no_demand_proof")
  ).toBe(true);
  expect(result.checked).toStrictEqual(
    expect.arrayContaining([
      expect.objectContaining({ reason: "no_demand_proof" }),
    ])
  );
  const rank = trace.entries.find((entry) => entry.step === "directions.rank");
  expect(rank?.output).toMatchObject({
    gate: expect.arrayContaining([
      expect.objectContaining({ reason: "no_demand_proof" }),
    ]),
    unconfirmed: true,
  });
});

it("with the evidence gate, a proven theme hides the unproven ones", async () => {
  const result = await suggestDirections(gatedDeps(), request());
  expect(result.unconfirmed).toBeUndefined();
  expect(result.directions.every((one) => one.caution === undefined)).toBe(
    true
  );
});

it("with the evidence gate, every direction carries the same card, best first", async () => {
  const result = await suggestDirections(gatedDeps(), request());
  expect(result.directions.length).toBeGreaterThan(0);
  const scores = result.directions.map((one) => one.score);
  expect(scores).toStrictEqual(scores.toSorted((a, b) => b - a));
  for (const direction of result.directions) {
    expect(direction.spot?.score).toBe(direction.score);
    expect(direction.title).not.toBe(direction.theme);
    expect(direction.card).toMatchObject({
      audience: { reason: "not_read", status: "unavailable" },
      competition: { status: "ok", value: { level: "open", listings: 0 } },
      make: { status: "ok", value: { products: ["t-shirt"] } },
      origin: "directions",
      why: {
        status: "ok",
        value: {
          demand: {
            status: "ok",
            value: { ads: { reason: "not_connected" }, proven: true },
          },
          qlooTag: { name: direction.theme },
        },
      },
    });
  }
});

// A writer whose titles stay the raw tag.
const rawTitles: Nemotron = async <T extends z.ZodType>(asked: Ask<T>) => {
  const { evidence } = JSON.parse(asked.prompt) as {
    evidence: { qloo: { tag: string } };
  };
  const named = (await nameIdeas(asked)) as object;
  return await Promise.resolve(
    asked.schema.parse({ ...named, title: evidence.qloo.tag })
  );
};

it("with the evidence gate, never shows a direction whose title stays the raw tag", async () => {
  const events: DirectionEvent[] = [];
  const result = await suggestDirections(
    gatedDeps({
      ask: rawTitles,
      onEvent: (event) => {
        events.push(event);
      },
    }),
    request()
  );
  expect(result.directions).toStrictEqual([]);
  expect(events.some((event) => event.kind === "direction")).toBe(false);
});

// A merchant's record for one theme: `wins` designs that sold, `losses`
// that didn't.
const DAY_MS = 86_400_000;
const designsFor = (theme: string, wins: number, losses: number) =>
  Array.from({ length: wins + losses }, (_, index): DesignOutcome => {
    const won = index < wins;
    return {
      addToCarts: 0,
      clicks: 0,
      dropId: `${theme}_${index}`,
      impressions: 0,
      launchedAt: new Date(Date.now() - 10 * DAY_MS),
      productId: `${theme}_${index}`,
      profitPerSaleCents: 1000,
      purchases: 0,
      qlooTags: [theme],
      revenueCents: 0,
      salesCovered: true,
      spendCents: won ? 0 : 500,
      theme,
      units: won ? 3 : 0,
    };
  });

it("with a strong track record, the rank follows it and says why", async () => {
  const plain = await suggestDirections(gatedDeps(), request());
  const themes = themesOf(plain);
  expect(themes.length).toBeGreaterThan(1);
  const first = themes[0] ?? "";
  const last = themes.at(-1) ?? "";
  const record = fitOutcomeModel([
    ...designsFor(last, 12, 0),
    ...designsFor(first, 0, 12),
  ]);
  const result = await suggestDirections(
    gatedDeps({ outcomes: record }),
    request()
  );
  expect(themesOf(result)[0]).toBe(last);
  const [top] = result.directions;
  expect(top?.outcome).toMatchObject({ direction: "up", kind: "theme" });
  expect(top?.card?.outcome).toStrictEqual(top?.outcome);
  expect(top?.spot?.score).toBeLessThan(top?.score ?? 0);
});

it("with no track record, the rank is unchanged", async () => {
  const plain = await suggestDirections(gatedDeps(), request());
  const empty = await suggestDirections(
    gatedDeps({ outcomes: fitOutcomeModel([]) }),
    request()
  );
  expect(themesOf(empty)).toStrictEqual(themesOf(plain));
  expect(empty.directions.map((one) => one.score)).toStrictEqual(
    plain.directions.map((one) => one.score)
  );
  expect(empty.directions.every((one) => one.outcome === undefined)).toBe(true);
});
