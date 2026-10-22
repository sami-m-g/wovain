import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { Design } from "@wovain/shared/design";
import { judgeRuleSchema } from "@wovain/shared/judge";
import type { DesignBrief, JudgeReply } from "@wovain/shared/judge";
import { genkit } from "genkit";
import { mockModel } from "genkit/testing";
import { vi } from "vitest";

import { loadEnv } from "../src/env.ts";
import { createStorage } from "../src/firebase.ts";
import type { Storage } from "../src/firebase.ts";
import type { QlooGet } from "../src/lib/qloo.ts";
import type { SearchResult, TavilyApi } from "../src/lib/tavily.ts";
import { createDeps, createServer } from "../src/server.ts";
import type { Deps } from "../src/server.ts";
import { createStore } from "../src/store.ts";
import type { Store } from "../src/store.ts";

// A fresh, empty Firestore and bucket on the Firebase emulators (`pnpm test`
// starts them): each call gets its own demo project, which the
// emulators keep apart and which needs no credentials.
export const testStorage = (): Storage => {
  const projectId = `demo-${crypto.randomUUID()}`;
  return createStorage(
    { projectId, storageBucket: `${projectId}.appspot.com` },
    projectId
  );
};

export const testStore = (storage: Storage = testStorage()) =>
  createStore(storage.db, storage.media, "test");

// A Genkit instance whose "mockModel" answers with `respond`.
export const mockAi = (respond: Parameters<typeof mockModel>[1]) => {
  const ai = genkit({});
  return { ai, model: mockModel(ai, respond) };
};

// A Tavily result, scored lower the later it's numbered.
export const searchResult = (
  n: number,
  title: string,
  more: Partial<SearchResult> = {}
): SearchResult => ({
  content: `Snippet ${n}`,
  id: `r${n}`,
  publishedDate: "",
  score: 1 - n / 100,
  title,
  url: `https://news.example/${n}`,
  ...more,
});

// A Qloo client that answers from `responses`, keyed by the request's
// filter.type (or its path when it has none); an Error rejects.
// `requests` records each path and query.
export const fakeQloo = (responses: Record<string, unknown>) => {
  const requests =
    vi.fn<(path: string, query: Record<string, unknown>) => void>();
  const get: QlooGet = async (path, query, schema) => {
    requests(path, query);
    const answer = responses[String(query["filter.type"] ?? path)];
    if (answer instanceof Error) {
      throw answer;
    }
    return await Promise.resolve(schema.parse(answer));
  };
  return Object.assign(get, { requests });
};

// Qloo's taste graph for "synthwave": two entities, three tags (one not a
// tag ID) and a rising trend.
export const qlooTaste = {
  "/search": {
    results: [
      { entity_id: "E1", name: "Kavinsky", types: ["urn:entity:artist"] },
      { entity_id: "E2", name: "Drive", types: ["urn:entity:movie"] },
    ],
  },
  "urn:entity:artist": {
    results: {
      trending: [
        { population_rank_velocity: -1 },
        { population_rank_velocity: 3 },
      ],
    },
  },
  "urn:tag": {
    results: {
      tags: [
        {
          id: "urn:tag:genre:music:outrun",
          name: "Outrun",
          query: { affinity: 0.6 },
        },
        { name: "No ID", query: { affinity: 0.99 } },
        {
          name: "Neon noir",
          query: { affinity: 0.9 },
          tag_id: "urn:tag:genre:media:neon_noir",
        },
      ],
    },
  },
};

// A Tavily client whose every search returns `results`.
interface FakeTavily {
  answer?: string;
  // What getResearch answers.
  brief?: Awaited<ReturnType<TavilyApi["getResearch"]>>;
  images?: { description?: string; url: string }[];
  // Pages extract and crawl return.
  pages?: { rawContent: string; url: string }[];
  // URLs map returns for the merchant's shop.
  shop?: string[];
}

// A Tavily client whose every search returns `results`; each call reports
// 1 credit (crawl 3).
export const fakeTavily = (
  results: SearchResult[],
  { answer, brief, images = [], pages = [], shop = [] }: FakeTavily = {}
) => {
  const base = { requestId: "test", responseTime: 0, usage: { credits: 1 } };
  return {
    crawl: vi.fn<TavilyApi["crawl"]>(
      async (url) =>
        await Promise.resolve({
          ...base,
          baseUrl: url,
          results: pages.map((page) => ({ ...page, images: [] })),
          usage: { credits: 3 },
        })
    ),
    extract: vi.fn<TavilyApi["extract"]>(
      async () =>
        await Promise.resolve({
          ...base,
          failedResults: [],
          results: pages.map((page) => ({ ...page, title: null })),
        })
    ),
    getResearch: vi.fn<TavilyApi["getResearch"]>(
      async () =>
        await Promise.resolve(
          brief ?? { requestId: "brief-1", responseTime: 0, status: "pending" }
        )
    ),
    map: vi.fn<TavilyApi["map"]>(
      async (url) =>
        await Promise.resolve({ ...base, baseUrl: url, results: shop })
    ),
    research: vi.fn<TavilyApi["research"]>(
      async (input) =>
        await Promise.resolve({
          createdAt: "",
          input,
          model: "mini",
          requestId: "brief-1",
          responseTime: 0,
          status: "pending",
        })
    ),
    search: vi.fn<TavilyApi["search"]>(
      async (query) =>
        await Promise.resolve({
          ...base,
          ...(answer === undefined ? {} : { answer }),
          images,
          query,
          results,
        })
    ),
  };
};

// A client talking to a fresh wovain server over an in-memory transport.
// Services in `deps` replace the ones built from `env`.
export const connectClient = async (
  env: Record<string, string>,
  store: Store,
  deps: Partial<Deps> = {}
) => {
  const loaded = loadEnv(env);
  const server = createServer(loaded, store, {
    ...createDeps(loaded),
    ...deps,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
};

const realFetch = globalThis.fetch;

// Calls to the local Firebase emulators, which the store reaches over fetch.
const isEmulator = (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : input);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
};

// Stands in for the network until restoreFetch, except for the emulators.
export const stubFetch = (
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
) => {
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) =>
      await (isEmulator(input) ? realFetch(input, init) : impl(input, init))
  );
};

export const restoreFetch = () => {
  vi.unstubAllGlobals();
};

// The PRD's demo tee: $30 on a $17.70 blank (prd.md > Pricing and economics).
export const demoDesign: Omit<Design, "id"> = {
  artwork: {
    requiredPx: 1800,
    transparent: true,
    url: "https://cdn.fourthwall.com/customizations/art.png",
    widthPx: 4500,
  },
  blank: { catalogProductId: "pro_1", name: "Bella+Canvas 3001 tee" },
  coach: "Soft bestseller tee.",
  colors: [{ hex: "#111111", inStock: true, name: "Black" }],
  customizationId: "cus_1",
  extraPlacements: [],
  idea: "Japanese cat sunset",
  listing: { description: "Two lines.", title: "Japanese Cat Sunset Tee" },
  mockups: [
    {
      alt: "Black tee",
      color: "Black",
      url: "https://cdn.fourthwall.com/offer-renders/black.webp",
    },
  ],
  placement: { area: "Front", printSize: "12×16 in", style: "large center" },
  quote: {
    baseCost: 17.7,
    breakevenPerSale: 10.32,
    cardFees: 1.38,
    marginPct: 41,
    price: 30,
    profit: 12.3,
    refundReserve: 0.6,
    roas: 2.9,
  },
  range: [],
  rejectCount: 0,
  sizes: [{ baseCost: 17.7, inStock: true, size: "M" }],
  status: "live",
};

// The demo tee as judge_design's brief, with three in-stock colors.
export const demoBrief: DesignBrief = {
  artwork: demoDesign.artwork,
  artworkDescription: "An orange cat silhouette against a red setting sun.",
  blank: demoDesign.blank,
  coach: demoDesign.coach,
  colors: [
    { hex: "#111111", inStock: true, name: "Black" },
    { hex: "#1f2a44", inStock: true, name: "Navy" },
    { hex: "#f5f5f0", inStock: true, name: "White" },
  ],
  idea: demoDesign.idea,
  listing: {
    description:
      "A calm cat watches the sun go down over Mount Fuji. For anyone who loves cats and quiet evenings.",
    title: "Japanese Cat Sunset Tee, Retro Mount Fuji Graphic",
  },
  placement: demoDesign.placement,
};

// A reply that passes every rule, as the model would send it.
export const passingReply: JudgeReply = {
  checks: judgeRuleSchema.options.map((rule) => ({
    note: "Fine.",
    pass: true,
    rule,
  })),
  coach: "Soft bestseller tee, and the art prints sharp at this size.",
  fixes: [],
  score: 92,
};
