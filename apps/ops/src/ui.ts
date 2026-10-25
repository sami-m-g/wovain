import { mkdir, writeFile } from "node:fs/promises";

import { chromium } from "playwright";

// Loads each page the KPI file names in headless Chromium and measures what
// a visitor sees: Largest Contentful Paint, Cumulative Layout Shift, console
// errors, plus a screenshot and the page's accessibility tree (an ARIA
// snapshot) for the scout flow to read. Only counts leave the browser; no
// console text is kept.

export interface PageReading {
  page: string;
  lcp: number | undefined;
  cls: number;
  consoleErrors: number;
  aria: string;
}

const SETTLE_MS = 3000;
const MAX_ARIA = 4000;

// Runs in the page: the buffered LCP and layout-shift entries so far.
// takeRecords hands over the buffered entries without waiting for a callback.
const vitals = () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, where outer scope doesn't exist
  const take = (type: string) => {
    const observer = new PerformanceObserver(() => null);
    observer.observe({ buffered: true, type });
    const entries = observer.takeRecords();
    observer.disconnect();
    return entries;
  };
  const lcp = take("largest-contentful-paint").at(-1)?.startTime;
  let cls = 0;
  for (const entry of take("layout-shift")) {
    const shift: { value?: unknown; hadRecentInput?: unknown } = entry.toJSON();
    if (shift.hadRecentInput !== true && typeof shift.value === "number") {
      cls += shift.value;
    }
  }
  return { cls, lcp };
};

export const inspectPages = async (
  site: string,
  pages: string[],
  outDir: string
): Promise<PageReading[]> => {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const readings: PageReading[] = [];
    for (const page of pages) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one page at a time keeps measurements comparable
      const tab = await browser.newPage({
        viewport: { height: 844, width: 390 },
      });
      let consoleErrors = 0;
      tab.on("console", (message) => {
        if (message.type() === "error") {
          consoleErrors += 1;
        }
      });
      tab.on("pageerror", () => {
        consoleErrors += 1;
      });
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      await tab.goto(new URL(page, site).toString(), { waitUntil: "load" });
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      await tab.waitForTimeout(SETTLE_MS);
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      const { cls, lcp } = await tab.evaluate(vitals);
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      const aria = await tab.locator("body").ariaSnapshot();
      const slug =
        page.replaceAll(/[^a-z0-9]+/giu, "-").replaceAll(/^-|-$/gu, "") ||
        "home";
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      await tab.screenshot({ fullPage: true, path: `${outDir}/${slug}.png` });
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      await writeFile(`${outDir}/${slug}.aria.yml`, aria);
      readings.push({
        aria: aria.slice(0, MAX_ARIA),
        cls,
        consoleErrors,
        lcp,
        page,
      });
      // oxlint-disable-next-line eslint/no-await-in-loop -- same page
      await tab.close();
    }
    return readings;
  } finally {
    await browser.close();
  }
};
