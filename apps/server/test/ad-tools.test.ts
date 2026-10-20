import { afterEach, beforeEach, expect, test } from "bun:test";
import path from "node:path";

import type { Client } from "@modelcontextprotocol/client";
import { defaultSettings } from "@wovain-foss/shared/settings";
import { listVideoPrices } from "@wovain-foss/shared/video-models";
import { z } from "zod";

import { setResolver } from "../src/lib/fetch-image.ts";
import { planVideos } from "../src/lib/video-plan.ts";
import type { Store } from "../src/store.ts";
import {
  connectClient,
  demoDesign,
  restoreFetch,
  stubFetch,
  testStore,
} from "./helpers.ts";

const clip = await Bun.file(
  path.join(import.meta.dir, "fixtures", "clip-1s.mp4")
).arrayBuffer();

let client: Client;
let store: Store;
let uploads: { contentType: string | null; size: number }[] = [];

beforeEach(async () => {
  uploads = [];
  setResolver(async () => await Promise.resolve(["93.184.216.34"]));
  stubFetch(async (input: string | URL | Request, init?: RequestInit) => {
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
      const { body } = init;
      uploads.push({
        contentType: new Headers(init.headers).get("content-type"),
        size: body instanceof Blob ? body.size : 0,
      });
      return await Promise.resolve(new Response(null, { status: 200 }));
    }
    return await Promise.resolve(new Response(clip, { status: 200 }));
  });
  store = await testStore();
  await store.saveDesign(demoDesign);
  client = await connectClient({ FAL_KEY: "test-key" }, store);
});

afterEach(async () => {
  await client.close();
  restoreFetch();
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
  const stored = { ...demoDesign, id: "d1" };
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
    reference_image_urls: [demoDesign.mockups[0]?.url, demoDesign.artwork.url],
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
    elements: [{ frontal_image_url: demoDesign.artwork.url }],
    start_image_url: demoDesign.mockups[0]?.url,
  });
  expect(kling.keepsPrint).toBe(true);
});

test("video_spend says how to set it up when there's no billing key", async () => {
  const result = await call("video_spend", {});
  expect(result.isError).toBeFalsy();
  expect(JSON.stringify(result.content)).toContain("FAL_BILLING_KEY");
});
