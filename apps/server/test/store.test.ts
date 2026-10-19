import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { defaultSettings } from "@wovain/shared/settings";

import { loadEnv } from "../src/env.ts";
import { createStore } from "../src/store.ts";

const tempDir = async () => await mkdtemp(path.join(tmpdir(), "wovain-"));

describe("settings store", () => {
  test("starts with the spec defaults when no file exists", async () => {
    const store = createStore(await tempDir());
    const settings = await store.getSettings();
    expect(settings.campaign.dailyBudgetPerProduct).toBe(15);
    expect(settings.pricing).toEqual({
      minMarginPct: 30,
      minProfit: 10,
      roundToCleanPrice: true,
    });
    expect(settings.rules.killNoSalesMultiple).toBe(3);
    expect(settings.video.model).toBe("kling-v3-standard");
    expect(settings.audio.source).toBe("mmaudio");
    expect(settings.meta.graphApiVersion).toBe("v26.0");
  });

  test("a patch changes only the named fields and survives a reload", async () => {
    const dir = await tempDir();
    const store = createStore(dir);
    await store.updateSettings({ campaign: { dailyBudgetPerProduct: 20 } });

    const reloaded = await createStore(dir).getSettings();
    expect(reloaded.campaign.dailyBudgetPerProduct).toBe(20);
    expect(reloaded.rules).toEqual(defaultSettings().rules);

    const onDisk: unknown = JSON.parse(await readFile(store.file, "utf-8"));
    expect(onDisk).toMatchObject({
      settings: { campaign: { dailyBudgetPerProduct: 20 } },
    });
  });

  test("rejects an invalid value and keeps the file unchanged", async () => {
    const store = createStore(await tempDir());
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

  test("starts without keys when the env file is missing", () => {
    const env = loadEnv({ WOVAIN_ENV_FILE: "/nonexistent/wovain/.env" });
    expect(env.FAL_KEY).toBeUndefined();
  });
});
