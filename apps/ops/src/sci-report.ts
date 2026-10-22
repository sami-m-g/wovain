import { writeFile } from "node:fs/promises";

import { ciContext } from "./ci.ts";
import { clipStatsSchema } from "./clip-stats.ts";
import { REQUESTS } from "./google.ts";
import { sciJson, sciOf, sciReport } from "./sci.ts";

// Recomputes wovain's SCI on every main pipeline (.gitlab/ci/loop.yml, sci
// job) from the last 7 days: Cloud Run instance time and requests (Cloud
// Monitoring), CI job time of main pipelines (GitLab) and the weekly job's
// aggregate of fal clips' GPU seconds (its fal-clips.json artifact; this job
// never reads merchants' records). Writes sci-report.md, sci.json and
// metrics.txt (a GitLab metrics report) as job artifacts; the latest is at
// /-/jobs/artifacts/main/raw/sci-report.md?job=sci.

const { gitlab, google } = ciContext();

const now = new Date();
const week = { end: now, start: new Date(now.getTime() - 7 * 86_400_000) };

// No artifact yet, or no clip in its window: the video line uses the estimate.
const clipsOrNothing = async () => {
  try {
    return await gitlab.inProject(
      clipStatsSchema,
      "GET",
      "jobs/artifacts/main/raw/fal-clips.json",
      { job: "weekly" }
    );
  } catch {
    return null;
  }
};

const pipelines = await gitlab.pipelines({
  ref: "main",
  updated_after: week.start.toISOString(),
});
const [instanceSeconds, requests, jobSeconds, clips] = await Promise.all([
  google.sum("run.googleapis.com/container/billable_instance_time", week),
  google.sum(REQUESTS, week),
  Promise.all(
    pipelines.map(async (p) => {
      const jobs = await gitlab.pipelineJobs(p.id);
      return jobs.reduce((sum, job) => sum + (job.duration ?? 0), 0);
    })
  ),
  clipsOrNothing(),
]);
const measured = {
  ciSeconds: jobSeconds.reduce((sum, s) => sum + s, 0),
  clips,
  instanceSeconds,
  mainPipelines: pipelines.length,
  requests,
};
const { total } = sciOf(measured);
const report = sciReport(measured, now);
console.log(report);
await Promise.all([
  writeFile("sci-report.md", `${report}\n`),
  writeFile("sci.json", sciJson(measured, now)),
  writeFile("metrics.txt", `sci_gco2e_per_run ${total.toFixed(4)}\n`),
]);
