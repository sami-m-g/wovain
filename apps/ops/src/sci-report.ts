import { writeFile } from "node:fs/promises";

import { opsContext } from "./env.ts";
import { loadKpis } from "./kpis.ts";
import { sciOf, sciReport } from "./sci.ts";

// The sci job (.gitlab/ci/ops.yml), on every main pipeline: the last 7 days'
// Cloud Run instance time and requests, main pipelines' CI time and Duo
// sessions. Writes sci-report.md, sci.json and metrics.txt (a GitLab metrics
// report, so MRs show the change); the latest report is at
// /-/jobs/artifacts/main/raw/sci-report.md?job=sci.

const DAYS = 7;
const { gitlab, google } = opsContext();
const { service } = await loadKpis();
const now = new Date();
const range = { end: now, start: new Date(now.getTime() - DAYS * 86_400_000) };

const metric = async (type: string) =>
  await google.metric(
    {
      aligner: "ALIGN_SUM",
      filter: `metric.type="${type}" AND ${service.metrics}`,
      reducer: "REDUCE_SUM",
    },
    range
  );

const [instanceSeconds, requests, pipelines, sessions] = await Promise.all([
  metric("run.googleapis.com/container/billable_instance_time"),
  metric("run.googleapis.com/request_count"),
  gitlab.pipelines({ ref: "main", updated_after: range.start.toISOString() }),
  gitlab.sessions(),
]);
const jobSeconds = await Promise.all(
  pipelines.map(async (p) => {
    const jobs = await gitlab.pipelineJobs(p.id);
    return jobs.reduce((sum, job) => sum + (job.duration ?? 0), 0);
  })
);
const measured = {
  ciSeconds: jobSeconds.reduce((sum, s) => sum + s, 0),
  duoSessions: sessions.filter(
    (s) => Date.parse(s.createdAt) >= range.start.getTime()
  ).length,
  instanceSeconds,
  requests,
};
const { perThousand, total } = sciOf(measured);
const report = sciReport(measured, now, DAYS);
console.log(report);
await Promise.all([
  writeFile("sci-report.md", `${report}\n`),
  writeFile(
    "sci.json",
    `${JSON.stringify({ at: now.toISOString(), measured, perThousand, total }, null, 2)}\n`
  ),
  writeFile(
    "metrics.txt",
    `sci_gco2e_total_7d ${total.toFixed(3)}\n${perThousand === undefined ? "" : `sci_gco2e_per_1k_requests ${perThousand.toFixed(4)}\n`}`
  ),
]);
