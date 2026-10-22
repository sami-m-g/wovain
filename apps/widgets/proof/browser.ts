import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";
import type { Page } from "playwright";
import { build } from "vite";

import type { Journey, Step } from "./journey.ts";

const widgetsDir = path.join(import.meta.dirname, "..");
const mockupsDir = path.join(widgetsDir, ".storybook", "public", "mockups");

// host.ts bundled for the browser, once per run.
const bundleHost = async () => {
  const output = await build({
    build: {
      lib: {
        entry: path.join(import.meta.dirname, "host.ts"),
        formats: ["iife"],
        name: "proofHost",
      },
      write: false,
    },
    configFile: false,
    logLevel: "warn",
  });
  const [first] = Array.isArray(output) ? output : [output];
  const chunk =
    first !== undefined && "output" in first ? first.output[0] : undefined;
  if (chunk === undefined) {
    throw new Error("host.ts didn't bundle");
  }
  return chunk.code;
};

// The fixtures point at Fourthwall's and fal's CDNs; screenshots show the
// Storybook mockups instead, the one the URL names (tee-black, mug-white…).
const serveMockups = async (page: Page) => {
  const files = await readdir(mockupsDir);
  const mockups = files.map((file) => path.basename(file, ".svg"));
  await page.route(/^https:\/\//u, async (route) => {
    const url = route.request().url();
    const video = /\.mp4(?:$|\?)/u.test(url);
    const name = mockups.find((mockup) => url.includes(mockup)) ?? "tee-black";
    await route.fulfill(
      video
        ? { path: path.join(mockupsDir, "..", "videos", "ugc-A.mp4") }
        : {
            contentType: "image/svg+xml",
            path: path.join(mockupsDir, `${name}.svg`),
          }
    );
  });
};

// Opens Chromium; `shoot` renders a step's widget (or page) and saves it.
export const openBrowser = async () => {
  const [browser, host] = await Promise.all([chromium.launch(), bundleHost()]);

  const widgetShot = async (page: Page, journey: Journey, step: Step) => {
    const widget = step.widget ?? "settings";
    const html = await readFile(
      path.join(widgetsDir, "dist", `${widget}.html`),
      "utf-8"
    );
    await page.setContent(
      '<!doctype html><html><body style="margin:0;background:#fff"></body></html>'
    );
    await page.evaluate(
      (proof) => {
        window.proof = proof;
      },
      {
        html,
        input: step.input,
        replies: journey.replies,
        result: step.result ?? { content: [] },
        theme: "light" as const,
      }
    );
    await page.addScriptTag({ content: host });
    await page.waitForFunction(() => window.proofReady === true);
    const frame = page.frameLocator("iframe");
    await frame.locator("#root > *").first().waitFor();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    return page.locator("iframe");
  };

  return {
    close: async () => {
      await browser.close();
    },
    // Saves the step's screenshot to `file`; false when it has nothing to show.
    shoot: async (journey: Journey, step: Step, file: string) => {
      if (step.widget === undefined && step.page === undefined) {
        return false;
      }
      const page = await browser.newPage({
        deviceScaleFactor: 2,
        viewport: { height: 900, width: 768 },
      });
      await serveMockups(page);
      if (step.widget === undefined) {
        await page.setContent(step.page ?? "");
        await page.screenshot({ fullPage: true, path: file });
      } else {
        const frame = await widgetShot(page, journey, step);
        await frame.screenshot({ path: file });
      }
      await page.close();
      return true;
    },
    // A 1280×720 still of `html`, for the demo video.
    still: async (html: string, file: string) => {
      const page = await browser.newPage({
        viewport: { height: 720, width: 1280 },
      });
      await page.setContent(html);
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: file });
      await page.close();
    },
  };
};
