import type { Client } from "@modelcontextprotocol/client";
import { defaultSettings } from "@wovain/shared/settings";
import { listVideoPrices } from "@wovain/shared/video-models";
import { afterEach, beforeEach, expect, test } from "vitest";
import { z } from "zod";

import { planVideos } from "../../src/lib/video-plan.ts";
import type { Store } from "../../src/store.ts";
import { connectClient, demoDesign, testStore } from "../helpers.ts";

let client: Client;
let store: Store;

beforeEach(async () => {
  store = testStore();
  await store.saveDesign(demoDesign);
  client = await connectClient({ FAL_KEY: "test-key" }, store);
});

afterEach(async () => {
  await client.close();
});

const call = async (name: string, args: Record<string, unknown>) =>
  await client.callTool({ arguments: args, name });

const adWidget = {
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

test("the ad widget's breakeven and rules match the PRD demo tee", async () => {
  const result = await call("show_ad_widget", adWidget);
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

test("record_ad counts the ad widgets still waiting", async () => {
  await call("show_ad_widget", adWidget);
  const result = await call("record_ad", { designId: "d1", status: "added" });
  expect(result.structuredContent).toMatchObject({
    ad: { status: "added" },
    waiting: 0,
  });
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
