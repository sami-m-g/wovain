import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { openBrowser } from "./browser.ts";
import { readJourney, reportDir, shotOf } from "./journey.ts";
import type { Step } from "./journey.ts";

// Turns e2e-report/journey.json into e2e-report/index.html: one section per
// step with its checks, timing, redacted input and output, and a screenshot
// of the widget drawn from the step's real structuredContent.
const escape = (text: string) =>
  text.replaceAll(
    /[&<>"]/gu,
    (char) =>
      ({ '"': "&quot;", "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char
  );

const json = (value: unknown) =>
  `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`;

const section = (step: Step, index: number, shot: boolean) => `
<section>
  <h2><span>${String(index + 1)}</span> ${escape(step.title)}</h2>
  <p class="meta"><code>${escape(step.tool)}</code> · ${String(Math.round(step.ms))} ms${step.widget === undefined ? "" : ` · ${step.widget} widget`}</p>
  <ul>${step.checks.map((check) => `<li>${escape(check)}</li>`).join("")}</ul>
  ${shot ? `<img src="${shotOf(index)}" alt="${escape(step.title)}" loading="lazy">` : ""}
  <details><summary>Input</summary>${json(step.input)}</details>
  <details><summary>Output</summary>${json(step.result?.structuredContent ?? step.result?.content ?? null)}</details>
</section>`;

const journey = await readJourney();
await rm(path.join(reportDir, "shots"), { force: true, recursive: true });
await mkdir(path.join(reportDir, "shots"), { recursive: true });
const browser = await openBrowser();
const shots = await Promise.all(
  journey.steps.map(
    async (step, index) =>
      await browser.shoot(journey, step, path.join(reportDir, shotOf(index)))
  )
);
await browser.close();

const total = journey.steps.reduce((sum, step) => sum + step.ms, 0);
const checks = journey.steps.reduce((sum, step) => sum + step.checks.length, 0);
await writeFile(
  path.join(reportDir, "index.html"),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wovain journey proof</title>
<style>
:root{color-scheme:light dark;--line:#8884}
body{margin:0 auto;max-width:860px;padding:24px 16px;font:15px/1.5 system-ui,sans-serif}
h1{margin:0 0 4px}h2{margin:0 0 4px;font-size:1.15rem}
h2 span{display:inline-block;min-width:1.6em;color:#888}
section{border-top:1px solid var(--line);padding:20px 0}
.meta{margin:0;color:#888}ul{padding-left:20px}li::marker{content:"✓ ";color:#2a7}
img{max-width:100%;border:1px solid var(--line);border-radius:12px;margin:8px 0}
pre{overflow:auto;max-height:420px;font-size:12px;background:#8881;padding:12px;border-radius:8px}
</style></head><body>
<h1>wovain journey proof</h1>
<p class="meta">${escape(journey.startedAt)} · ${String(journey.steps.length)} steps · ${String(checks)} checks passed · ${String(Math.round(total))} ms in tools · ${journey.live.length === 0 ? "recorded fixtures" : `live: ${escape(journey.live.join(", "))}`}</p>
${journey.steps.map((step, index) => section(step, index, shots[index] === true)).join("")}
</body></html>
`
);
console.log(`Report: ${path.join(reportDir, "index.html")}`);
