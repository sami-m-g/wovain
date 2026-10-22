import { writeFile } from "node:fs/promises";

import { ciContext } from "./ci.ts";
import { REQUESTS } from "./google.ts";
import { sciOf, sciReport } from "./sci.ts";

// Recomputes wovain's SCI on every main pipeline (.gitlab/ci/loop.yml, sci
// job) from the last 7 days: Cloud Run instance time and requests (Cloud
// Monitoring) and CI job time of main pipelines (GitLab). Writes
// sci-report.md, sci.json and metrics.txt (a GitLab metrics report) as job
// artifacts; the latest is at
// /-/jobs/artifacts/main/raw/sci-report.md?job=sci.

const { gitlab, google } = ciContext();

const now = new Date();
const week = { end: now, start: new Date(now.getTime() - 7 * 86_400_000) };

const pipelines = await gitlab.pipelines({
  ref: "main",
  updated_after: week.start.toISOString(),
});
const [instanceSeconds, requests, jobSeconds] = await Promise.all([
  google.sum("run.googleapis.com/container/billable_instance_time", week),
  google.sum(REQUESTS, week),
  Promise.all(
    pipelines.map(async (p) => {
      const jobs = await gitlab.pipelineJobs(p.id);
      return jobs.reduce((sum, job) => sum + (job.duration ?? 0), 0);
    })
  ),
]);
const measured = {
  ciSeconds: jobSeconds.reduce((sum, s) => sum + s, 0),
  instanceSeconds,
  mainPipelines: pipelines.length,
  requests,
};
const { parts, total } = sciOf(measured);
const report = sciReport(measured, now);
console.log(report);
await Promise.all([
  writeFile("sci-report.md", `${report}\n`),
  writeFile(
    "sci.json",
    `${JSON.stringify({ at: now.toISOString(), gramsPerRun: total, measured, parts }, null, 2)}\n`
  ),
  writeFile("metrics.txt", `sci_gco2e_per_run ${total.toFixed(4)}\n`),
]);
