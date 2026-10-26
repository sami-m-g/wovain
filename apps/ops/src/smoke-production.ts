import { errorSink } from "./context.ts";
import { ENV } from "./env.ts";
import { runChecks, smokeException } from "./smoke.ts";

// smoke:production (.gitlab/ci/deploy.yml), after every production deploy:
// the synthetic checks of smoke.ts. A failure goes to PostHog Error Tracking,
// where heal and the release guard read it, and fails the job.

const sites = { docs: ENV.DOCS_SITE_URL, site: ENV.SITE_URL };
const results = await runChecks(sites);
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.check}: ${r.detail}`);
}
const sink = errorSink();
if (sink !== undefined) {
  for (const result of failed) {
    sink.capture(smokeException(result, sites));
  }
  await sink.flush();
}
if (failed.length > 0) {
  process.exitCode = 1;
}
