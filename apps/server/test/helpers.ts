import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { Design } from "@wovain/shared/design";

import type { Db } from "../src/db/client.ts";
import { createTestDb } from "../src/db/testing.ts";
import { loadEnv } from "../src/env.ts";
import { createServer } from "../src/server.ts";
import { createStore } from "../src/store.ts";
import type { Media, Store } from "../src/store.ts";

// Blob stand-in: bytes kept in memory for the test's lifetime.
const memoryMedia = (): Media => {
  const blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    get: async (key) => await Promise.resolve(blobs.get(key)),
    put: async (key, bytes) => {
      blobs.set(key, new Uint8Array(bytes));
      await Promise.resolve();
    },
  };
};

// In-memory Postgres (PGlite) with every migration applied, plus memory media.
export const testStorage = async (): Promise<{ db: Db; media: Media }> => ({
  db: await createTestDb(),
  media: memoryMedia(),
});

export const testStore = async (storage?: { db: Db; media: Media }) => {
  const { db, media } = storage ?? (await testStorage());
  return createStore(db, media, "test");
};

// A client talking to a fresh wovain server over an in-memory transport.
export const connectClient = async (
  env: Record<string, string>,
  store: Store
) => {
  const server = createServer(loadEnv(env), store);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
};

const realFetch = globalThis.fetch;

// Stands in for the network until restoreFetch; Bun's fetch type also wants
// preconnect, so the real one is carried over.
export const stubFetch = (
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
) => {
  globalThis.fetch = Object.assign(impl, {
    preconnect: realFetch.preconnect,
  });
};

export const restoreFetch = () => {
  globalThis.fetch = realFetch;
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
