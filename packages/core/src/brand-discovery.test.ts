import { afterEach, expect, it, vi } from "vitest";
import type { z } from "zod";

import {
  buyersOf,
  discoverBrands,
  palettesFromWords,
  pickReferences,
  seedsOf,
} from "./brand-discovery";
import type { DiscoveryDeps, DiscoveryRequest } from "./brand-discovery";
import {
  contrastRatio,
  knownGarments,
  MIN_INK_CONTRAST,
} from "./garment-colors";
import type { Ask, Nemotron } from "./nemotron";
import type { InsightsQuery, QlooInsight } from "./qloo";
import { DecisionTrace } from "./trace";

afterEach(() => {
  vi.restoreAllMocks();
});

const HIKING = "urn:audience:hobbies_and_interests:hiking";
const GAMER = "urn:audience:hobbies_and_interests:video_gamer";
const YOGA = "urn:audience:hobbies_and_interests:yoga";

// A Qloo whose answers depend on the signals, as the real one's do: each
// input gets its own entities, named after it.
const insightFor = (query: InsightsQuery): QlooInsight[] => {
  const input = [...(query.audiences ?? []), ...(query.entities ?? [])]
    .map((id) => id.split(":").at(-1))
    .join("+");
  return Array.from({ length: 6 }, (_, index) => ({
    affinity: 0.8,
    id: `${input}-${query.type}-${index}`,
    name: `${input} ${query.type} ${index}`,
    popularity: 0.6,
    type: query.type,
  }));
};

const qlooFake = (fail = false) => ({
  demographicsOf: vi.fn(
    async (ids: readonly string[]) =>
      await Promise.resolve(
        ids.map((id) => ({
          age: id.includes("hiking")
            ? { "35_to_44": 0.4, "45_to_54": 0.1 }
            : { "24_and_younger": 0.5, "25_to_29": 0.45 },
          gender: id.includes("yoga") ? { female: 0.4, male: -0.3 } : {},
          id,
        }))
      )
  ),
  insights: vi.fn(async (query: InsightsQuery) => {
    if (fail) {
      throw new Error("Qloo /v2/insights answered 503");
    }
    return await Promise.resolve(insightFor(query));
  }),
  tagsFor: vi.fn(
    async (ids: readonly string[]) =>
      await Promise.resolve([
        {
          affinity: 0.9,
          id: `urn:tag:genre:media:${ids[0]}`,
          name: `${ids[0]} genre`,
        },
      ])
  ),
});

const tavilyFake = (): DiscoveryDeps["tavily"] =>
  ({
    search: vi.fn(
      async (query: string) =>
        await Promise.resolve({
          results: query.includes("Hiking")
            ? Array.from({ length: 10 }, (_, index) => ({
                content: "Hiking t-shirt",
                score: 0.9,
                title: `Hiking t-shirt ${index}`,
                url: `https://www.etsy.com/listing/${index}`,
              }))
            : [
                {
                  content: `${query} is rising`,
                  score: 0.8,
                  title: `${query} story`,
                  url: "https://news.example.com/a",
                },
              ],
        })
    ),
  }) as unknown as DiscoveryDeps["tavily"];

// Words that follow the Qloo facts in the prompt, as the real writer is
// told to: the niche and palette come from each card's references.
const shadeOf = (text: string, salt: number) =>
  (
    16 +
    ([...text].reduce(
      (sum, char) => sum * 31 + (char.codePointAt(0) ?? 0),
      salt
    ) %
      200)
  )
    .toString(16)
    .padStart(2, "0");

const writeWords: Nemotron = async <T extends z.ZodType>({
  prompt,
  schema,
}: Ask<T>) => {
  const { card } = JSON.parse(prompt) as { card: { references: string[] } };
  const [first = ""] = card.references;
  const reply = {
    name: `Brand ${first}`.slice(0, 40),
    niche: `${first} people`.slice(0, 60),
    nicheAlternatives: [`fans of ${first}`.slice(0, 60)],
    palettes: [1, 2].map((salt) => ({
      garments: ["Ivory", "Navy"],
      inks: [`#${shadeOf(first, salt)}2030`, `#${shadeOf(first, salt)}3A20`],
      label: "warm earthy tones",
    })),
    products: [
      { idea: "a hand-drawn crest", kind: "t-shirt" },
      { idea: "a small patch", kind: "cap" },
    ],
    voiceLines: ["Made for slow Sundays."],
    why: "Its fans share a strong taste and few shops serve them.",
  };
  return await Promise.resolve(schema.parse(reply));
};

const depsWith = (overrides: Partial<DiscoveryDeps> = {}): DiscoveryDeps => ({
  ask: writeWords,
  blank: {
    assumed: false,
    colors: knownGarments(["Ivory", "Pepper", "Sage"]),
    name: "Comfort Colors 1717",
  },
  locale: "en",
  qloo: qlooFake(),
  salt: "user-1",
  tavily: tavilyFake(),
  ...overrides,
});

const questions = (
  answers: Partial<Extract<DiscoveryRequest, { mode: "questions" }>["answers"]>
): DiscoveryRequest => ({
  answers: { audiences: [], loves: [], ...answers },
  mode: "questions",
});

it("gives different answers different niches, references and palettes", async () => {
  const deps = depsWith();
  const first = await discoverBrands(
    deps,
    questions({ age: "25_to_29", audiences: [GAMER] })
  );
  const second = await discoverBrands(
    deps,
    questions({ age: "45_to_54", audiences: [HIKING] })
  );
  const [one] = first.cards;
  const [other] = second.cards;
  expect(one).toBeDefined();
  expect(other).toBeDefined();
  expect(one?.niche).not.toBe(other?.niche);
  expect(one?.references.map((ref) => ref.id)).not.toStrictEqual(
    other?.references.map((ref) => ref.id)
  );
  expect(one?.palettes[0]?.inks).not.toStrictEqual(other?.palettes[0]?.inks);
});

it("suggests something else for me than my answers do", async () => {
  const deps = depsWith();
  const auto = await discoverBrands(deps, { mode: "auto", round: 0 });
  const answered = await discoverBrands(
    deps,
    questions({
      audiences: [YOGA],
      loves: [
        { id: "Q-GHIBLI", name: "Studio Ghibli", type: "urn:entity:movie" },
      ],
    })
  );
  const niches = (cards: typeof auto.cards) => cards.map((card) => card.niche);
  expect(auto.cards.length).toBeGreaterThan(0);
  expect(niches(auto.cards)).not.toStrictEqual(niches(answered.cards));
});

it("never lets two cards share a niche, a reference or a palette", async () => {
  const { cards } = await discoverBrands(depsWith(), {
    mode: "auto",
    round: 0,
  });
  const refs = cards.flatMap((card) => card.references.map((ref) => ref.id));
  expect(new Set(refs).size).toBe(refs.length);
  const niches = cards.map((card) => card.niche);
  expect(new Set(niches).size).toBe(niches.length);
  const palettes = cards.map((card) => card.palettes[0]?.inks.join(","));
  expect(new Set(palettes).size).toBe(palettes.length);
});

it("holds palettes to the blank's colours", async () => {
  const { cards } = await discoverBrands(depsWith(), {
    mode: "auto",
    round: 0,
  });
  for (const card of cards) {
    for (const palette of card.palettes) {
      // The writer asked for Navy, which this blank doesn't come in.
      expect(palette.garments.map((garment) => garment.name)).toStrictEqual([
        "Ivory",
      ]);
    }
  }
});

it("ranks a crowded niche below an open one", async () => {
  const { cards } = await discoverBrands(
    depsWith(),
    questions({ audiences: [HIKING, GAMER] })
  );
  const hiking = cards.find((card) => card.key === HIKING);
  const gamer = cards.find((card) => card.key === GAMER);
  expect(hiking?.saturation).toBe("high");
  expect(gamer?.score ?? 0).toBeGreaterThan(hiking?.score ?? 0);
});

it("fails without Qloo instead of suggesting without it", async () => {
  const ask = vi.fn(writeWords);
  await expect(
    discoverBrands(
      depsWith({ ask: ask as unknown as Nemotron, qloo: qlooFake(true) }),
      {
        mode: "auto",
        round: 0,
      }
    )
  ).rejects.toMatchObject({ status: 502 });
  expect(ask).not.toHaveBeenCalled();
});

it("shows fewer cards, never filler, when Qloo finds little", async () => {
  const qloo = qlooFake();
  qloo.insights.mockImplementation(
    async (query: InsightsQuery) =>
      await Promise.resolve(
        query.audiences?.includes(GAMER)
          ? insightFor(query)
          : insightFor(query).slice(0, 1)
      )
  );
  const { cards } = await discoverBrands(
    depsWith({ qloo }),
    questions({ audiences: [GAMER, HIKING, YOGA] })
  );
  expect(cards.map((card) => card.key)).toStrictEqual([GAMER]);
});

it("records each step in the decision trace", async () => {
  const trace = new DecisionTrace({ userId: "user-1" });
  await discoverBrands(depsWith({ trace }), questions({ audiences: [GAMER] }));
  const steps = trace.entries.map((entry) => entry.step);
  expect(steps).toEqual(
    expect.arrayContaining([
      "discovery.start",
      "qloo.insights",
      "qloo.demographics",
      "qloo.tags",
      "tavily.momentum",
      "rank",
      "palette.fit",
    ])
  );
});

const autoKeys = (round: number) =>
  seedsOf({ mode: "auto", round }, "user-1").map((seed) => seed.key);

it("rotates Suggest for me between rounds", () => {
  expect(autoKeys(0)).not.toStrictEqual(autoKeys(1));
  expect(autoKeys(0)).toStrictEqual(autoKeys(0));
});

it("prefers specific references to global ones and skips used ones", () => {
  const candidates: QlooInsight[] = [
    { affinity: 0.9, id: "A", name: "Dua Lipa", popularity: 1, type: "artist" },
    {
      affinity: 0.8,
      id: "B",
      name: "Novo Amor",
      popularity: 0.9,
      type: "artist",
    },
    { affinity: 0.8, id: "C", name: "Lissie", popularity: 0.9, type: "artist" },
    {
      affinity: 0.8,
      id: "D",
      name: "Ben Harper",
      popularity: 0.95,
      type: "artist",
    },
  ];
  const { picked } = pickReferences(
    candidates,
    { entities: [] },
    new Set(["C"])
  );
  expect(picked.map((one) => one.id)).toStrictEqual(["B", "D", "A"]);
});

it("reads who buys from Qloo's demographics", () => {
  expect(
    buyersOf(
      [
        {
          age: { "25_to_29": 0.3, "30_to_34": 0.25 },
          gender: { female: 0.3, male: -0.2 },
          id: "A",
        },
      ],
      ["A"]
    )
  ).toStrictEqual({
    age: "25_to_29",
    audience: undefined,
    gender: "female",
    nextAge: "30_to_34",
  });
});

it("re-suggests colours from plain words, held to the blank", async () => {
  const asked: string[] = [];
  const ask: Nemotron = async <T extends z.ZodType>({
    prompt,
    schema,
  }: Ask<T>) => {
    asked.push(prompt);
    return await Promise.resolve(
      schema.parse({
        palettes: [
          // Pale butter on Ivory fails and is darkened; Navy isn't offered.
          {
            garments: ["Ivory", "Navy"],
            inks: ["#F3E3A1", "#7A2E1F"],
            label: "warmer cream",
          },
          {
            garments: ["Pepper"],
            inks: ["#F2ECDD", "#E8A33D"],
            label: "rust on charcoal",
          },
        ],
      })
    );
  };
  const { palettes } = await palettesFromWords(depsWith({ ask }), {
    current: ["#3B2A20", "#A3AE91"],
    words: "warmer",
  });
  expect(JSON.parse(asked[0] ?? "{}")).toMatchObject({ words: "warmer" });
  expect(palettes.map((one) => one.label)).toStrictEqual([
    "warmer cream",
    "rust on charcoal",
  ]);
  for (const palette of palettes) {
    for (const garment of palette.garments) {
      expect(garment.name).not.toBe("Navy");
      for (const ink of palette.inks) {
        expect(contrastRatio(ink, garment.hex)).toBeGreaterThanOrEqual(
          MIN_INK_CONTRAST
        );
      }
    }
  }
});
