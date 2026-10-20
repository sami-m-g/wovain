import { describe, expect, test } from "bun:test";

import { defaultSettings } from "@wovain/shared/settings";

import { loadEnv } from "../src/env.ts";
import { createStore } from "../src/store.ts";
import { demoDesign, testStorage, testStore } from "./helpers.ts";

const artwork = {
  bytes: 3,
  contentType: "image/png" as const,
  height: 1,
  transparent: true,
  width: 1,
};

// Records live in Postgres; tests use PGlite, the same engine as Neon.
const storage = await testStorage();
const open = (user: string) => createStore(storage.db, storage.media, user);

describe("records", () => {
  const run = crypto.randomUUID();

  test("keeps each merchant's records apart", async () => {
    const alice = open(`${run}-alice`);
    const bob = open(`${run}-bob`);
    await alice.updateSettings({ campaign: { dailyBudgetPerProduct: 40 } });
    const saved = await alice.saveDesign(demoDesign);
    const aliceSettings = await alice.getSettings();
    const bobSettings = await bob.getSettings();
    expect(aliceSettings.campaign.dailyBudgetPerProduct).toBe(40);
    expect(bobSettings.campaign.dailyBudgetPerProduct).toBe(15);
    expect(await bob.getDesign(saved.id)).toBeUndefined();
  });

  test("gives designs saved at the same time different ids", async () => {
    const store = open(`${run}-ids`);
    const saved = await Promise.all(
      Array.from({ length: 5 }, async () => await store.saveDesign(demoDesign))
    );
    const ids = new Set(saved.map((design) => design.id));
    expect(ids.size).toBe(5);
  });

  test("stores staged artwork bytes beside the record", async () => {
    const store = open(`${run}-art`);
    const bytes = new Uint8Array([1, 2, 3]);
    const saved = await store.saveArtwork(artwork, bytes, "a.png");
    const read = await store.getArtwork(saved.id);
    expect(read?.key).toBe(`${run}-art/a.png`);
    expect(read && (await store.readArtworkBytes(read))).toEqual(bytes);
  });
});

describe("settings store", () => {
  test("starts with the spec defaults when nothing is saved", async () => {
    const store = await testStore();
    const settings = await store.getSettings();
    expect(settings.campaign.dailyBudgetPerProduct).toBe(15);
    expect(settings.pricing).toEqual({
      minMarginPct: 30,
      minProfit: 10,
      roundToCleanPrice: true,
    });
    expect(settings.rules.killNoSalesMultiple).toBe(3);
    expect(settings.video.model).toBe("h3-max-reference");
    expect(settings.audio.source).toBe("mmaudio");
    expect(settings.meta.graphApiVersion).toBe("v26.0");
  });

  test("a patch changes only the named fields and survives a reload", async () => {
    const shared = await testStorage();
    const first = await testStore(shared);
    await first.updateSettings({ campaign: { dailyBudgetPerProduct: 20 } });

    const second = await testStore(shared);
    const reloaded = await second.getSettings();
    expect(reloaded.campaign.dailyBudgetPerProduct).toBe(20);
    expect(reloaded.rules).toEqual(defaultSettings().rules);
  });

  test("rejects an invalid value and keeps the saved value", async () => {
    const store = await testStore();
    await store.updateSettings({ campaign: { dailyBudgetPerProduct: 20 } });
    const rejected = await store
      .updateSettings({ campaign: { dailyBudgetPerProduct: 0 } })
      .then(
        () => false,
        () => true
      );
    expect(rejected).toBe(true);
    const settings = await store.getSettings();
    expect(settings.campaign.dailyBudgetPerProduct).toBe(20);
  });
});

describe("env", () => {
  test("treats empty values from .env.example as unset", () => {
    const env = loadEnv({ FAL_KEY: "", SERPAPI_KEY: "abc", WOVAIN_MOCK: "1" });
    expect(env.FAL_KEY).toBeUndefined();
    expect(env.SERPAPI_KEY).toBe("abc");
    expect(env.WOVAIN_MOCK).toBe(true);
  });
});
