import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  approveDesign,
  claimPublish,
  designHash,
} from "../../src/lib/approval.ts";
import { setResolver } from "../../src/lib/fetch-image.ts";
import type { Store } from "../../src/store.ts";
import {
  connectClient,
  restoreFetch,
  stubFetch,
  testStore,
} from "../helpers.ts";

const png = await readFile(
  path.join(import.meta.dirname, "..", "fixtures", "rgba-64x32.png")
);

let client: Client;
let store: Store;
let puts: {
  contentType: string | null;
  lengthRange: string | null;
  url: string;
}[] = [];

beforeEach(async () => {
  puts = [];
  // Every host resolves to a public address, except the ones a test makes private.
  setResolver(
    async (host) =>
      await Promise.resolve(
        host === "rebind.example" ? ["10.0.0.5"] : ["93.184.216.34"]
      )
  );
  // Stand-in for the network: downloads return the PNG fixture, PUTs are recorded.
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    if (init?.method === "PUT") {
      const headers = new Headers(init.headers);
      puts.push({
        contentType: headers.get("content-type"),
        lengthRange: headers.get("x-goog-content-length-range"),
        url,
      });
      return await Promise.resolve(new Response(null, { status: 200 }));
    }
    return await Promise.resolve(new Response(png, { status: 200 }));
  };
  stubFetch(fakeFetch);
  store = testStore();
  client = await connectClient({}, store);
});

afterEach(async () => {
  await client.close();
  setResolver();
  restoreFetch();
});

const call = async (name: string, args: Record<string, unknown>) =>
  await client.callTool({ arguments: args, name });

const quote = {
  baseCost: 17.7,
  breakevenPerSale: 10.32,
  cardFees: 1.38,
  marginPct: 41,
  price: 30,
  profit: 12.3,
  refundReserve: 0.6,
  roas: 2.9,
};

const design = {
  artwork: {
    requiredPx: 1800,
    transparent: true,
    url: "https://fal.media/a.png",
    widthPx: 4500,
  },
  blank: {
    badge: "Our pick",
    catalogProductId: "pro_1",
    name: "Bella+Canvas 3001 tee",
  },
  coach: "Soft bestseller tee, and the art prints sharp at this size.",
  colors: [{ hex: "#111111", inStock: true, name: "Black" }],
  customizationId: "cus_demo",
  idea: "Japanese cat sunset",
  listing: {
    description: "Two short lines.",
    title: "Japanese Cat Sunset Tee",
  },
  mockups: [
    {
      alt: "Tee on a model",
      color: "Black",
      url: "https://cdn.fourthwall.com/m.png",
    },
  ],
  placement: { area: "Front", printSize: "12×16 in", style: "large center" },
  quote,
  sizes: [{ baseCost: 17.7, inStock: true, size: "M" }],
};

test("stage_artwork reads ChatGPT's file param and reports size and transparency", async () => {
  const result = await call("stage_artwork", {
    artwork: {
      download_url: "https://files.oaiusercontent.com/x",
      file_id: "file_1",
    },
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({
    artworkId: "a1",
    bytes: png.byteLength,
    contentType: "image/png",
    height: 32,
    transparent: true,
    width: 64,
  });
});

test("stage_artwork takes image generation's data URL", async () => {
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  const result = await call("stage_artwork", { url: dataUrl });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toMatchObject({ height: 32, width: 64 });
  expect(result.structuredContent).not.toHaveProperty("url");
});

test("stage_artwork refuses private addresses", async () => {
  const result = await call("stage_artwork", {
    url: "https://127.0.0.1/a.png",
  });
  expect(result.isError).toBe(true);
});

test("stage_artwork refuses a hostname that resolves to a private address", async () => {
  const result = await call("stage_artwork", {
    url: "https://rebind.example/a.png",
  });
  expect(result.isError).toBe(true);
});

test("put_artwork uploads only to Fourthwall storage", async () => {
  await call("stage_artwork", { url: "https://fal.media/files/a.png" });
  const refused = await call("put_artwork", {
    artworkId: "a1",
    uploadUrl: "https://evil.example/upload",
  });
  expect(refused.isError).toBe(true);
  const uploaded = await call("put_artwork", {
    artworkId: "a1",
    uploadUrl:
      "https://storage.googleapis.com/popshopprod-orders-tmp/upload.png?sig=1",
  });
  expect(uploaded.isError).toBeFalsy();
  expect(puts).toEqual([
    {
      contentType: "image/png",
      lengthRange: `0,${png.byteLength}`,
      url: "https://storage.googleapis.com/popshopprod-orders-tmp/upload.png?sig=1",
    },
  ]);
});

test("put_artwork refuses other buckets on Google storage", async () => {
  await call("stage_artwork", { url: "https://fal.media/files/a.png" });
  const result = await call("put_artwork", {
    artworkId: "a1",
    uploadUrl: "https://storage.googleapis.com/someone-else/upload.png?sig=1",
  });
  expect(result.isError).toBe(true);
  expect(puts).toEqual([]);
});

test("stage_artwork refuses a download that declares more than 50 MB", async () => {
  stubFetch(
    async () =>
      await Promise.resolve(
        new Response("x", {
          headers: { "content-length": String(60 * 1024 * 1024) },
        })
      )
  );
  const result = await call("stage_artwork", {
    url: "https://fal.media/big.png",
  });
  expect(result.isError).toBe(true);
});

test("price_product prices the demo tee at $30", async () => {
  const result = await call("price_product", {
    sizes: [{ baseCost: 17.7, size: "M" }],
  });
  expect(result.structuredContent).toMatchObject({ quote: { price: 30 } });
});

test("the model can't mark a design approved or live", async () => {
  const shown = await call("show_design_widget", design);
  expect(shown.structuredContent).toMatchObject({
    design: { id: "d1", status: "draft" },
  });
  const refused = await Promise.all(
    ["publishing", "live"].map(
      async (status) => await call("record_design", { id: "d1", status })
    )
  );
  expect(refused.map((result) => result.isError)).toEqual([true, true]);
  const read = await call("get_design", { id: "d1" });
  expect(read.structuredContent).toMatchObject({ design: { status: "draft" } });
});

test("redrawing after feedback keeps the id; rejections are counted", async () => {
  await call("show_design_widget", design);
  await call("show_design_widget", {
    ...design,
    coach: "Moved the art up.",
    id: "d1",
  });
  await call("record_design", {
    id: "d1",
    rejectReason: "Low resolution",
    status: "rejected",
  });
  await call("record_design", {
    id: "d1",
    rejectReason: "Still low",
    status: "rejected",
  });
  const read = await call("get_design", { id: "d1" });
  expect(read.structuredContent).toMatchObject({
    design: {
      coach: "Moved the art up.",
      rejectCount: 2,
      rejectReason: "Still low",
    },
  });
});

test("wovain prices the hero and every product of the drop itself", async () => {
  const shown = await call("show_design_widget", {
    ...design,
    // A price from the agent is ignored.
    quote: { ...quote, price: 99 },
    range: [
      {
        ...design,
        customizationId: "cus_mug",
        kind: "Mug",
        quote: { ...quote, price: 1 },
        sizes: [{ baseCost: 9.6, inStock: true, size: "11 oz" }],
      },
    ],
  });
  expect(shown.isError).toBeFalsy();
  expect(shown.structuredContent).toMatchObject({
    design: { quote: { price: 30 }, range: [{ quote: { price: 22 } }] },
  });
});

test("publish_design says so when connections aren't set up", async () => {
  await call("show_design_widget", design);
  const result = await call("publish_design", { id: "d1" });
  expect(result.structuredContent).toEqual({ configured: false });
});

// The merchant confirms the design as shown (the confirm page's call).
const approved = async () => {
  await call("show_design_widget", design);
  const shown = await store.requireDesign("d1");
  return await approveDesign(store, "d1", designHash(shown));
};

describe("approval", () => {
  test("is recorded only for the content it names", async () => {
    await call("show_design_widget", design);
    await expect(approveDesign(store, "d1", "another-hash")).rejects.toThrow(
      "changed"
    );
    const design1 = await approved();
    expect(design1).toMatchObject({ status: "publishing" });
  });

  test("publishing needs it, and only one publish holds it", async () => {
    await call("show_design_widget", design);
    await expect(claimPublish(store, "d1")).rejects.toThrow("isn't approved");
    await approved();
    await claimPublish(store, "d1");
    await expect(claimPublish(store, "d1")).rejects.toThrow(
      "already being published"
    );
    // A publish that died long ago gives way.
    await claimPublish(store, "d1", new Date(Date.now() + 11 * 60 * 1000));
  });

  test("a redraw after approval clears it", async () => {
    await approved();
    await call("show_design_widget", {
      ...design,
      coach: "A new coach line.",
      id: "d1",
    });
    const redrawn = await store.requireDesign("d1");
    expect(redrawn.status).toBe("draft");
    expect(redrawn.approval).toBeUndefined();
    await expect(claimPublish(store, "d1")).rejects.toThrow("isn't approved");
  });

  test("a redraw keeps offers only for unchanged products", async () => {
    await call("show_design_widget", {
      ...design,
      range: [{ ...design, customizationId: "cus_mug", kind: "Mug" }],
    });
    await store.updateDesign("d1", {
      collectionId: "cltn_1",
      productId: "off_1",
    });
    const stored = await store.requireDesign("d1");
    await store.updateDesign("d1", {
      range: stored.range.map((item) => ({ ...item, offerId: "off_mug" })),
    });

    await call("show_design_widget", {
      ...design,
      id: "d1",
      range: [{ ...design, customizationId: "cus_mug", kind: "Mug" }],
    });
    expect(await store.requireDesign("d1")).toMatchObject({
      collectionId: "cltn_1",
      productId: "off_1",
      range: [{ offerId: "off_mug" }],
    });

    // New hero art: a new customization, so no offer and no collection.
    await call("show_design_widget", {
      ...design,
      customizationId: "cus_new",
      id: "d1",
      range: [{ ...design, customizationId: "cus_mug", kind: "Mug" }],
    });
    const changed = await store.requireDesign("d1");
    expect(changed.productId).toBeUndefined();
    expect(changed.collectionId).toBeUndefined();
    expect(changed.range[0]?.offerId).toBe("off_mug");
  });
});
