import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Client } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, expect, test } from "vitest";

import { setResolver } from "../../src/lib/fetch-image.ts";
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
  const store = testStore();
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

test("a design goes draft → publishing → live, and the widget can read it", async () => {
  const shown = await call("show_design_widget", design);
  expect(shown.structuredContent).toMatchObject({
    design: { id: "d1", status: "draft" },
  });

  await call("record_design", { id: "d1", status: "publishing" });
  await call("record_design", {
    id: "d1",
    productId: "off_1",
    productUrl: "https://wovain.fourthwall.com/products/cat",
    status: "live",
  });
  const read = await call("get_design", { id: "d1" });
  expect(read.structuredContent).toMatchObject({
    design: {
      productUrl: "https://wovain.fourthwall.com/products/cat",
      status: "live",
    },
  });
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
