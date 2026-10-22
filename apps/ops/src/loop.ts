import { z } from "zod";

import { createGitLab } from "./gitlab.ts";
import type { GitLab } from "./gitlab.ts";
import { createGoogle } from "./google.ts";
import { createO11y } from "./o11y.ts";
import { scout, verify } from "./scout.ts";
import { shepherd } from "./shepherd.ts";

// The self-healing loop, run by the "wovain loop" pipeline schedule
// (.gitlab/ci/loop.yml): verify merged fixes, file new problems for Duo,
// move Duo's merge requests to auto-merge, and once a day post the digest.
// docs/loop.md draws it.

const env = z
  .object({
    CI_API_V4_URL: z.url().default("https://gitlab.com/api/v4"),
    CI_PROJECT_ID: z.string(),
    // The hour (UTC) the daily digest is posted; FORCE_DIGEST posts now.
    DIGEST_HOUR: z.coerce.number().default(7),
    FIREBASE_PROJECT_ID: z.string(),
    FORCE_DIGEST: z.string().optional(),
    GITLAB_O11Y_API_KEY: z.string().optional(),
    GITLAB_O11Y_URL: z.url().optional(),
    GITLAB_TOKEN: z.string(),
  })
  .parse(process.env);

const digest = async (gitlab: GitLab, lines: string[]) => {
  const open = await gitlab.issues({ labels: "digest", state: "opened" });
  const issue =
    open[0] ??
    (await gitlab.createIssue({ labels: "digest", title: "wovain digest" }));
  await gitlab.noteOnIssue(issue.iid, lines.join("\n"));
};

const list = (record: Record<number, unknown>, sigil: string) => {
  const entries = Object.entries(record);
  return entries.length === 0
    ? "none"
    : entries.map(([iid, what]) => `${sigil}${iid} ${String(what)}`).join(", ");
};

const now = new Date();
const gitlab = createGitLab({
  api: env.CI_API_V4_URL,
  project: env.CI_PROJECT_ID,
  token: env.GITLAB_TOKEN,
});
const sources = {
  gitlab,
  google: createGoogle(env.FIREBASE_PROJECT_ID),
  o11y:
    env.GITLAB_O11Y_URL !== undefined && env.GITLAB_O11Y_API_KEY !== undefined
      ? createO11y(env.GITLAB_O11Y_URL, env.GITLAB_O11Y_API_KEY)
      : undefined,
};

const verdicts = await verify(sources, now);
const { filed, problems } = await scout(sources, now);
const merges = await shepherd(gitlab, now);

const report = [
  `**wovain loop**, ${now.toISOString()}`,
  "",
  `- Health: ${problems.length === 0 ? "no production errors in the last 6 hours" : problems.map((p) => `${p.count}× ${p.fingerprint}`).join(", ")}`,
  `- Filed: ${filed === undefined ? "none" : `#${filed.iid}`}`,
  `- Fixes checked: ${list(verdicts, "#")}`,
  `- Duo merge requests: ${list(merges, "!")}`,
  `- GitLab Observability: ${sources.o11y === undefined ? "not read (no GITLAB_O11Y_API_KEY)" : "read"}`,
];
console.log(report.join("\n"));
if (env.FORCE_DIGEST !== undefined || now.getUTCHours() === env.DIGEST_HOUR) {
  await digest(gitlab, report);
}
