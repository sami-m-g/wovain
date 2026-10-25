import { mkdir, writeFile } from "node:fs/promises";

import { opsContext } from "./env.ts";
import { kpiReport, loadKpis, rank } from "./kpis.ts";
import type { Kpi } from "./kpis.ts";
import { inspectPages } from "./ui.ts";
import type { PageReading } from "./ui.ts";

// scout:collect (.gitlab/ci/scout.yml), daily on the "wovain scout"
// schedule: measures every KPI in .gitlab/duo/kpis.yml (Cloud Monitoring,
// Cloud Logging, and the live site in headless Chromium), ranks the gaps, and
// writes the snapshot to the open "kpi-snapshot" issue, where the scout flow
// reads it. Numbers and our own pages' accessibility trees only: no log text.

const SNAPSHOT_LABEL = "kpi-snapshot";
const OUT = "scout";

const { gitlab, google } = opsContext();
// The live site: SITE_URL in CI, production (wovain.com) by default.
const site = process.env["SITE_URL"] ?? "https://wovain.com";
const config = await loadKpis();
const now = new Date();
const range = {
  end: now,
  start: new Date(now.getTime() - config.windowDays * 86_400_000),
};

const uiPages = [
  ...new Set(
    config.kpis.flatMap((k) => (k.source.kind === "ui" ? [k.source.page] : []))
  ),
];
const readings: PageReading[] =
  uiPages.length === 0 ? [] : await inspectPages(site, uiPages, `${OUT}/ui`);

const count = async (filter: string) => {
  const found = await google.entries(
    `${config.service.logs} AND (${filter})`,
    range
  );
  return { capped: found.capped, n: found.entries.length };
};

const measure = async (
  kpi: Kpi
): Promise<{ value: number | undefined; approximate: boolean }> => {
  const { source } = kpi;
  if (source.kind === "metric") {
    const value = await google.metric(
      { ...source, filter: `${source.filter} AND ${config.service.metrics}` },
      range
    );
    return { approximate: false, value: value * source.scale };
  }
  if (source.kind === "log-ratio") {
    const [num, den] = await Promise.all([
      count(source.numerator),
      count(source.denominator),
    ]);
    return {
      approximate: num.capped || den.capped,
      value: den.n === 0 ? undefined : num.n / den.n,
    };
  }
  const reading = readings.find((r) => r.page === source.page);
  return { approximate: false, value: reading?.[source.measure] };
};

const measured = await Promise.all(
  config.kpis.map(async (kpi) => ({ kpi, ...(await measure(kpi)) }))
);
const ranked = rank(measured);
const report = [
  kpiReport(ranked, now, config.windowDays),
  "",
  ...readings.flatMap((r) => [
    `<details><summary>Accessibility tree of ${r.page} (mobile viewport)</summary>`,
    "",
    "```yaml",
    r.aria,
    "```",
    "",
    "</details>",
    "",
  ]),
  `Screenshots: the \`scout:collect\` job's artifacts (${process.env["CI_JOB_URL"] ?? "local run"}).`,
].join("\n");

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/kpis.md`, `${report}\n`);
await writeFile(
  `${OUT}/kpis.json`,
  `${JSON.stringify({ at: now.toISOString(), kpis: ranked }, null, 2)}\n`
);
console.log(report);

const [snapshot] = await gitlab.issues({
  labels: SNAPSHOT_LABEL,
  state: "opened",
});
if (snapshot === undefined) {
  const created = await gitlab.createIssue({
    confidential: true,
    description: report,
    labels: SNAPSHOT_LABEL,
    title: "KPI snapshot (updated daily by scout:collect)",
  });
  console.log(`Created the snapshot issue #${created.iid}`);
} else {
  await gitlab.updateIssue(snapshot.iid, { description: report });
  console.log(`Updated the snapshot issue #${snapshot.iid}`);
}
