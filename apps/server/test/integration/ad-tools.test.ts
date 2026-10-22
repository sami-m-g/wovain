import type { Client } from "@modelcontextprotocol/client";
import { adResultSchema } from "@wovain/shared/ad";
import { defaultSettings } from "@wovain/shared/settings";
import { listVideoPrices } from "@wovain/shared/video-models";
import { afterEach, beforeEach, expect, test } from "vitest";

import { AD_IMAGE_ENDPOINT } from "../../src/lib/ad-images.ts";
import { localCipher } from "../../src/lib/cipher.ts";
import { createConnections } from "../../src/lib/connections.ts";
import { createUpstream } from "../../src/lib/upstream.ts";
import { planVideos } from "../../src/lib/video-plan.ts";
import type { Store } from "../../src/store.ts";
import { connectWith, fakeUpstream } from "../fake-upstream.ts";
import {
  connectClient,
  demoDesign,
  testStorage,
  testStore,
} from "../helpers.ts";

let client: Client;
let store: Store;

beforeEach(async () => {
  store = testStore();
  await store.saveDesign(demoDesign);
  // As if collect_ad_media had read these from jobs wovain submitted.
  await store.recordAdMedia("d1", {
    urls: [
      "https://v3b.fal.media/files/b/x/a.jpg",
      "https://v3b.fal.media/files/b/x/b.jpg",
      "https://v3b.fal.media/files/b/x/c.jpg",
    ],
  });
  client = await connectClient({ FAL_KEY: "test-key" }, store);
});

afterEach(async () => {
  await client.close();
});

const call = async (name: string, args: Record<string, unknown>) =>
  await client.callTool({ arguments: args, name });

const concept = (id: string, url: string) => ({
  angle: "Gift for cat people",
  assets: [
    { alt: "Picnic scene", kind: "image", ratio: "4:5", source: "fal", url },
    {
      alt: "Black tee",
      kind: "image",
      ratio: "1:1",
      source: "fourthwall",
      url: "https://cdn.fourthwall.com/offer-renders/black.webp",
    },
  ],
  audience: "Cat owners who collect Japanese prints",
  cta: "SHOP_NOW",
  headlines: ["Sakura Season Cat Tee"],
  hook: "For the friend whose cat runs the house.",
  id,
  name: `Concept ${id}`,
  primaryTexts: ["A calico watches the sun go down."],
});

const adWidget = {
  coach: "Two angles plus your mockup.",
  concepts: [
    concept("c1", "https://v3b.fal.media/files/b/x/a.jpg"),
    concept("c2", "https://v3b.fal.media/files/b/x/b.jpg"),
  ],
  designId: "d1",
};

const adOf = (result: { structuredContent?: unknown }) =>
  adResultSchema.parse(result.structuredContent).ad;

test("the ad widget's breakeven and rules match the PRD demo tee", async () => {
  const ad = adOf(await call("show_ad_widget", adWidget));
  expect(ad.economics.breakevenPerSale).toBeCloseTo(10.32, 2);
  expect(ad.economics.roas).toBeCloseTo(2.9, 1);
  expect(ad.rules.killNoSalesAt).toBeCloseTo(30.96, 1);
  expect(ad.rules.scaleUnder).toBeCloseTo(8.26, 2);
  expect(ad.staticImage.url).toBe(
    "https://cdn.fourthwall.com/offer-renders/black.webp"
  );
  expect(ad.concepts.map((c) => [c.id, c.revision, c.status])).toEqual([
    ["c1", 1, "draft"],
    ["c2", 1, "draft"],
  ]);
});

test("record_ad decides one concept; the product is added once all are decided", async () => {
  await call("show_ad_widget", adWidget);
  const first = await call("record_ad", {
    conceptId: "c1",
    designId: "d1",
    status: "approved",
  });
  expect(first.structuredContent).toMatchObject({
    ad: { status: "draft" },
    waiting: 1,
  });
  const second = await call("record_ad", {
    conceptId: "c2",
    designId: "d1",
    status: "skipped",
  });
  expect(second.structuredContent).toMatchObject({
    ad: { status: "added" },
    waiting: 0,
  });
});

test("feedback revises one concept and keeps the other's choice", async () => {
  await call("show_ad_widget", adWidget);
  await call("record_ad", {
    conceptId: "c2",
    designId: "d1",
    status: "approved",
  });
  const ad = adOf(
    await call("show_ad_widget", {
      coach: "More playful now.",
      concepts: [
        {
          ...concept("c1", "https://v3b.fal.media/files/b/x/c.jpg"),
          feedback: "more playful",
          hook: "Your cat already picked this one.",
        },
      ],
      designId: "d1",
    })
  );
  expect(ad.concepts).toMatchObject([
    { feedback: "more playful", id: "c1", revision: 2, status: "draft" },
    { id: "c2", revision: 1, status: "approved" },
  ]);
  expect(ad.status).toBe("draft");
});

test("show_ad_widget refuses visuals from anywhere but fal and the design", async () => {
  const result = await call("show_ad_widget", {
    ...adWidget,
    concepts: [concept("c1", "https://evil.example/a.jpg")],
  });
  expect(result.isError).toBe(true);
});

test("show_ad_widget refuses fal media wovain didn't collect for the design", async () => {
  const result = await call("show_ad_widget", {
    ...adWidget,
    concepts: [concept("c1", "https://v3b.fal.media/files/someone-else.jpg")],
  });
  expect(result.isError).toBe(true);
});

test("add_video_audio refuses clips wovain didn't collect", async () => {
  const result = await call("add_video_audio", {
    designId: "d1",
    videoUrls: ["https://v3b.fal.media/files/someone-else.mp4"],
  });
  expect(result.isError).toBe(true);
});

test("a carousel needs live designs", async () => {
  await store.updateDesign("d1", { status: "draft" });
  const result = await call("show_ad_widget", {
    ...adWidget,
    concepts: [
      {
        ...concept("c3", "https://v3b.fal.media/files/b/x/a.jpg"),
        assets: [],
        cards: [
          {
            designId: "d1",
            headline: "Sunset Cat",
            imageUrl: "https://cdn.fourthwall.com/offer-renders/black.webp",
          },
          {
            designId: "d1",
            headline: "Sunset Cat again",
            imageUrl: "https://cdn.fourthwall.com/offer-renders/black.webp",
          },
        ],
      },
    ],
  });
  expect(result.isError).toBe(true);
  await store.updateDesign("d1", { status: "live" });
  const live = await call("show_ad_widget", {
    ...adWidget,
    concepts: [
      {
        ...concept("c3", "https://v3b.fal.media/files/b/x/a.jpg"),
        assets: [],
        cards: [
          {
            designId: "d1",
            headline: "Sunset Cat",
            imageUrl: "https://cdn.fourthwall.com/offer-renders/black.webp",
          },
          {
            designId: "d1",
            headline: "Sunset Cat again",
            imageUrl: "https://v3b.fal.media/files/b/x/a.jpg",
          },
        ],
      },
    ],
  });
  expect(live.isError).toBeFalsy();
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

// wovain's client on a fake fal, with the merchant ("test") connected.
const connectedFal = async () => {
  const fake = fakeUpstream("fal");
  const upstream = createUpstream({
    connections: createConnections(testStorage().db, localCipher()),
    fetch: fake.fetch,
    site: "https://wovain.test",
  });
  await connectWith(upstream, fake, "test", "fal");
  const falClient = await connectClient({}, store, { upstream });
  return { fake, falClient };
};

test("generate_videos submits exactly the planned clips on the merchant's fal", async () => {
  const { fake, falClient } = await connectedFal();
  const result = await falClient.callTool({
    arguments: { designId: "d1" },
    name: "generate_videos",
  });
  expect(result.isError).toBeFalsy();
  const plan = planVideos(
    { ...demoDesign, id: "d1" },
    defaultSettings(),
    listVideoPrices()
  );
  expect(fake.calls).toEqual([
    {
      arguments: {
        requests: plan.clips.map((clip, index) => ({
          endpoint_id: clip.endpointId,
          index,
          input: clip.input,
        })),
      },
      name: "submit_jobs",
    },
  ]);
});

test("add_video_audio takes only fal clip URLs", async () => {
  const { fake, falClient } = await connectedFal();
  const refused = await falClient.callTool({
    arguments: { designId: "d1", videoUrls: ["https://evil.example/a.mp4"] },
    name: "add_video_audio",
  });
  expect(refused.isError).toBe(true);
  expect(fake.calls).toEqual([]);
});

test("generate_videos gives a connect link before fal is connected", async () => {
  const fake = fakeUpstream("fal");
  const upstream = createUpstream({
    connections: createConnections(testStorage().db, localCipher()),
    fetch: fake.fetch,
    site: "https://wovain.test",
  });
  const falClient = await connectClient({}, store, { upstream });
  const result = await falClient.callTool({
    arguments: { designId: "d1" },
    name: "generate_videos",
  });
  expect(result.structuredContent).toMatchObject({ needsConnection: "fal" });
  expect(fake.calls).toEqual([]);
});

test("generate_ad_images edits the chosen mockup with the artwork as reference", async () => {
  const { fake, falClient } = await connectedFal();
  const result = await falClient.callTool({
    arguments: {
      designId: "d1",
      images: [
        { color: "Black", ratio: "4:5", scene: "Friends at a sunset picnic" },
        { ratio: "9:16", scene: "A woman laughs with her cat on a sofa" },
      ],
    },
    name: "generate_ad_images",
  });
  expect(result.isError).toBeFalsy();
  expect(fake.calls).toHaveLength(1);
  expect(fake.calls[0]).toMatchObject({
    arguments: {
      requests: [
        {
          endpoint_id: AD_IMAGE_ENDPOINT,
          index: 0,
          input: {
            aspect_ratio: "4:5",
            image_urls: [demoDesign.mockups[0]?.url, demoDesign.artwork.url],
          },
        },
        { index: 1, input: { aspect_ratio: "9:16" } },
      ],
    },
    name: "submit_jobs",
  });
});
