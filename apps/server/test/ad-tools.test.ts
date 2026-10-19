import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import type { Design } from "@wovain-foss/shared/design";
import { defaultSettings } from "@wovain-foss/shared/settings";
import { listVideoPrices } from "@wovain-foss/shared/video-models";
import { z } from "zod";

import { loadEnv } from "../src/env.ts";
import { setResolver } from "../src/lib/fetch-image.ts";
import { planVideos } from "../src/lib/video-plan.ts";
import { createServer } from "../src/server.ts";
import { createStore } from "../src/store.ts";
import type { Store } from "../src/store.ts";

const realFetch = globalThis.fetch;
const clip = await Bun.file(
  path.join(import.meta.dir, "fixtures", "clip-1s.mp4")
).arrayBuffer();

// The PRD's demo tee: $30 on a $17.70 blank (prd.md > Pricing and economics).
const design: Omit<Design, "id"> = {
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

let client: Client;
let store: Store;
let uploads: { contentType: string | null; size: number }[] = [];

beforeEach(async () => {
  uploads = [];
  setResolver(async () => await Promise.resolve(["93.184.216.34"]));
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("storage/upload/initiate")) {
        return await Promise.resolve(
          Response.json({
            file_url: "https://v3b.fal.media/files/b/x/finished.mp4",
            upload_url: "https://upload.fal.media/put?sig=1",
          })
        );
      }
      if (init?.method === "PUT") {
        const body =
          init.body instanceof Uint8Array ? init.body : new Uint8Array();
        uploads.push({
          contentType: new Headers(init.headers).get("content-type"),
          size: body.byteLength,
        });
        return await Promise.resolve(new Response(null, { status: 200 }));
      }
      return await Promise.resolve(new Response(clip, { status: 200 }));
    },
    { preconnect: realFetch.preconnect }
  );
  store = createStore(await mkdtemp(path.join(tmpdir(), "wovain-")));
  await store.saveDesign(design);
  const server = createServer(loadEnv({ FAL_KEY: "test-key" }), store);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
  globalThis.fetch = realFetch;
  setResolver();
});

const call = async (name: string, args: Record<string, unknown>) =>
  await client.callTool({ arguments: args, name });

const adCard = {
  coach: "Two try-on clips plus your mockup.",
  designId: "d1",
  headline: "Sakura Season Cat Tee",
  primaryText: "A calico watches the sun go down.",
  videos: [
    {
      angle: "UGC on-model",
      seconds: 15,
      slot: "A",
      status: "ready",
      url: "https://v3b.fal.media/files/b/x/a.mp4",
    },
    { angle: "UGC styling", seconds: 15, slot: "B", status: "failed" },
  ],
};

test("the ad card's breakeven and rules match the PRD demo tee", async () => {
  const result = await call("show_ad_card", adCard);
  const { ad } = z
    .object({
      ad: z.object({
        economics: z.object({ breakevenPerSale: z.number(), roas: z.number() }),
        rules: z.object({ killNoSalesAt: z.number(), scaleUnder: z.number() }),
        staticImage: z.object({ url: z.string() }),
      }),
    })
    .parse(result.structuredContent);
  expect(ad.economics.breakevenPerSale).toBeCloseTo(10.32, 2);
  expect(ad.economics.roas).toBeCloseTo(2.9, 1);
  expect(ad.rules.killNoSalesAt).toBeCloseTo(30.96, 1);
  expect(ad.rules.scaleUnder).toBeCloseTo(8.26, 2);
  expect(ad.staticImage.url).toBe(
    "https://cdn.fourthwall.com/offer-renders/black.webp"
  );
});

test("record_ad counts the ad cards still waiting", async () => {
  await call("show_ad_card", adCard);
  const result = await call("record_ad", { designId: "d1", status: "added" });
  expect(result.structuredContent).toMatchObject({
    ad: { status: "added" },
    waiting: 0,
  });
});

test("finish_video burns overlays and hosts the clip on fal", async () => {
  const result = await call("finish_video", {
    brand: "Wovain",
    caption: "Sakura season's softest tee",
    designId: "d1",
    slot: "A",
    videoUrl: "https://v3b.fal.media/files/b/x/raw.mp4",
  });
  expect(result.isError).toBeFalsy();
  expect(result.structuredContent).toEqual({
    url: "https://v3b.fal.media/files/b/x/finished.mp4",
  });
  expect(uploads).toHaveLength(1);
  expect(uploads[0]?.contentType).toBe("video/mp4");
  expect(uploads[0]?.size).toBeGreaterThan(1000);
});

test("video plans fit each model's inputs", () => {
  const settings = defaultSettings();
  const stored = { ...design, id: "d1" };
  const prices = listVideoPrices();

  const reference = planVideos(
    stored,
    { ...settings, video: { ...settings.video, model: "h3-max-reference" } },
    prices
  );
  expect(reference.clips).toHaveLength(2);
  expect(reference.clips[0]?.input).toMatchObject({
    aspect_ratio: "9:16",
    duration: 15,
    reference_image_urls: [design.mockups[0]?.url, design.artwork.url],
  });
  expect(reference.audio?.endpointId).toBe("fal-ai/mmaudio-v2");
  expect(reference.estimate.usd).toBeCloseTo(2 * (0.75 + 0.015), 2);
  expect(reference.estimate.note).toContain("fal may bill more");

  const klingO1 = planVideos(
    stored,
    { ...settings, video: { ...settings.video, model: "kling-o1-reference" } },
    prices
  );
  expect(klingO1.clips[0]?.input).toMatchObject({ duration: "10" });

  const kling = planVideos(
    stored,
    { ...settings, video: { ...settings.video, model: "kling-v3-standard" } },
    prices
  );
  expect(kling.clips[0]?.input).toMatchObject({
    elements: [{ frontal_image_url: design.artwork.url }],
    start_image_url: design.mockups[0]?.url,
  });
  expect(kling.keepsPrint).toBe(true);
});

test("video_spend says how to set it up when there's no billing key", async () => {
  const result = await call("video_spend", {});
  expect(result.isError).toBeFalsy();
  expect(JSON.stringify(result.content)).toContain("FAL_BILLING_KEY");
});
