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
