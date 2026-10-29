import { InMemoryStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import type { QlooEntity } from "@wovain/core/qloo";
import { fakeNemotron } from "@wovain/core/test-doubles";
import type { TavilySearch } from "@wovain/core/trends";
import { log as evlog } from "evlog";
import { afterEach, expect, it, vi } from "vitest";

import {
  resolveReferences,
  withBrandLines,
  writeBrandMemory,
} from "./brand-identity";
import type { ReferenceDeps } from "./brand-identity";
import { TASTE_TEMPLATE, tasteThread } from "./taste";

afterEach(() => {
  vi.restoreAllMocks();
});

const known: Record<string, QlooEntity> = {
  "Comme des Garcons": {
    id: "Q-CDG",
    name: "Comme des Garçons",
    popularity: 0.8,
    type: "urn:entity:brand",
  },
  "Rei Kawakubo": {
    id: "Q-REI",
    name: "Rei Kawakubo",
    type: "urn:entity:person",
  },
  "Wes Anderson": {
    id: "Q-WES",
    name: "Wes Anderson",
    popularity: 0.9,
    type: "urn:entity:person",
  },
};

const qloo = (failing: string[] = []) =>
  vi.fn(async (query: string) => {
    if (failing.includes(query)) {
      throw new Error("Qloo /search answered 429");
    }
    const found = known[query];
    return await Promise.resolve(found === undefined ? [] : [found]);
  });

const webWith = (
  results: { content: string; title: string; url: string }[]
): TavilySearch =>
  ({
    search: vi.fn(async () => await Promise.resolve({ results })),
  }) as unknown as TavilySearch;

const page = {
  content: "The label cites Rei Kawakubo and Comme des Garcons.",
  title: "Tiny Label interview",
  url: "https://example.com/tiny",
};

const deps = (over: Partial<ReferenceDeps> = {}): ReferenceDeps => ({
  ask: fakeNemotron({ proxies: [] }).ask,
  search: qloo(),
  web: webWith([]),
  ...over,
});

it("resolves a reference Qloo knows directly", async () => {
  const [wes] = await resolveReferences(deps(), ["Wes Anderson"]);

  expect(wes).toEqual({
    entities: [
      {
        id: "Q-WES",
        name: "Wes Anderson",
        score: 0.9,
        type: "urn:entity:person",
      },
    ],
    failed: false,
    reference: "Wes Anderson",
    sources: [],
    status: "direct",
  });
});

it("falls back to cultural proxies Qloo knows, with the web sources", async () => {
  const nemotron = fakeNemotron({
    proxies: ["Rei Kawakubo", "Comme des Garcons", "Nobody Qloo knows"],
  });

  const [tiny] = await resolveReferences(
    deps({ ask: nemotron.ask, web: webWith([page]) }),
    ["Tiny Label"]
  );

  expect(nemotron.asked).toEqual(["brand_proxies"]);
  expect(tiny?.status).toBe("proxy");
  expect(tiny?.entities.map((entity) => [entity.id, entity.from])).toEqual([
    ["Q-REI", "Tiny Label"],
    ["Q-CDG", "Tiny Label"],
  ]);
  expect(tiny?.sources).toEqual([
    { provider: "tavily", title: page.title, url: page.url },
  ]);
});

it("reports a reference nothing resolves without inventing an entity", async () => {
  const [ghost] = await resolveReferences(
    deps({
      ask: fakeNemotron({ proxies: ["Nobody"] }).ask,
      web: webWith([page]),
    }),
    ["Ghost Label"]
  );

  expect(ghost?.status).toBe("unresolved");
  expect(ghost?.entities).toEqual([]);
  expect(ghost?.failed).toBe(false);
});

it("logs a failing reference at error level and resolves the others", async () => {
  const error = vi.spyOn(evlog, "error").mockImplementation(() => {});
  const web = {
    search: vi.fn(async () => await Promise.reject(new Error("Tavily 432"))),
  } as unknown as TavilySearch;

  const resolved = await resolveReferences(
    deps({ search: qloo(["Broken"]), web }),
    ["Broken", "Wes Anderson", " wes anderson ", ""]
  );

  expect(
    resolved.map((one) => [one.reference, one.status, one.failed])
  ).toEqual([
    ["Broken", "unresolved", true],
    ["Wes Anderson", "direct", false],
  ]);
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({
      error: "ONBOARDING_REFERENCE_FAILED",
      reference: "Broken",
      step: "qloo_search",
    })
  );
});

it("sets the Voice, Palette and Niches lines and keeps the decisions", () => {
  const current = `${TASTE_TEMPLATE.replace(
    "- Approved designs:",
    "- Approved designs:\n  - Moth tee"
  )}`;

  const updated = withBrandLines(current, {
    niches: ["y2k racing", "cottagecore"],
    palette: ["#1A1A1A"],
    voice: "dry, lowercase",
  });

  expect(updated).toContain("- Voice: dry, lowercase\n");
  expect(updated).toContain("- Palette and typography: #1A1A1A\n");
  expect(updated).toContain("- Niches: y2k racing, cottagecore\n");
  expect(updated).toContain("- Approved designs:\n  - Moth tee");
});

it("writes the brand into the merchant's working memory", async () => {
  const memory = new Memory({
    options: {
      workingMemory: {
        enabled: true,
        scope: "resource",
        template: TASTE_TEMPLATE,
      },
    },
    storage: new InMemoryStore(),
  });
  await writeBrandMemory(memory, "merchant-1", {
    niches: ["y2k racing"],
    palette: [],
    voice: "dry",
  });

  const saved = await memory.getWorkingMemory({
    resourceId: "merchant-1",
    threadId: tasteThread("merchant-1"),
  });
  expect(saved).toContain("- Voice: dry");
  expect(saved).toContain("- Niches: y2k racing");
});
