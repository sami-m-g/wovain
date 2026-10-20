import { describe, expect, test } from "bun:test";

import { defaultSettings } from "@wovain-foss/shared/settings";
import { SQL } from "bun";

import { loadEnv } from "../src/env.ts";
import { createStore, fileMedia } from "../src/store.ts";
import type { Store } from "../src/store.ts";
import { demoDesign, tempDir, testStorage, testStore } from "./helpers.ts";

const artwork = {
  bytes: 3,
  contentType: "image/png" as const,
  height: 1,
  transparent: true,
  width: 1,
};

// The same checks on SQLite and, when TEST_DATABASE_URL points at a Neon
// branch, on Postgres; each run uses fresh user ids.
const backends: [string, (user: string) => Store | Promise<Store>][] = [
  [
    "sqlite",
    async (user) => {
      const { db, media } = await testStorage();
      return createStore(db, media, user);
    },
  ],
];
const pgUrl = process.env["TEST_DATABASE_URL"];
if (pgUrl !== undefined && pgUrl !== "") {
  const db = new SQL(pgUrl);
  const media = fileMedia(await tempDir());
  backends.push(["postgres", (user) => createStore(db, media, user)]);
}

describe.each(backends)("records on %s", (_name, open) => {
  const run = crypto.randomUUID();

  test("keeps each merchant's records apart", async () => {
    const alice = await open(`${run}-alice`);
    const bob = await open(`${run}-bob`);
    await alice.updateSettings({ campaign: { dailyBudgetPerProduct: 40 } });
    const saved = await alice.saveDesign(demoDesign);
    const aliceSettings = await alice.getSettings();
    const bobSettings = await bob.getSettings();
    expect(aliceSettings.campaign.dailyBudgetPerProduct).toBe(40);
    expect(bobSettings.campaign.dailyBudgetPerProduct).toBe(15);
    expect(await bob.getDesign(saved.id)).toBeUndefined();
  });

  test("gives designs saved at the same time different ids", async () => {
    const store = await open(`${run}-ids`);
    const saved = await Promise.all(
      Array.from({ length: 5 }, async () => await store.saveDesign(demoDesign))
    );
    const ids = new Set(saved.map((design) => design.id));
    expect(ids.size).toBe(5);
  });

  test("stores staged artwork bytes beside the record", async () => {
    const store = await open(`${run}-art`);
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
    const dir = await tempDir();
    const first = await testStore(dir);
    await first.updateSettings({ campaign: { dailyBudgetPerProduct: 20 } });

    const second = await testStore(dir);
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

  test("ships the caption font with the server", async () => {
    expect(await Bun.file(loadEnv({}).WOVAIN_FONT).exists()).toBe(true);
  });
});
