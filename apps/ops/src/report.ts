import { MAX_FILES, MAX_LINES } from "./guardrails.ts";
import type { Problem, Window } from "./signals.ts";

// The text the loop writes into GitLab. Hidden markers let the next run find
// what an earlier run did without a database.

export const marker = (kind: string) => `<!-- wovain-loop:${kind} -->`;

export const fingerprintIn = (text: string | null) =>
  /Fingerprint: `(?<fp>fp-[0-9a-f]{10})`/u.exec(text ?? "")?.groups?.["fp"];

// The intent the Duo Developer flow works from (issue template "Intent").
// Every value in it is server-controlled or allowlisted (signals.ts): no log
// message, URL or telemetry text reaches an issue. A problem with reasons for
// a human is filed as an intent, and the scout doesn't hand it to Duo.
export const issueBody = (
  problem: Problem,
  range: { start: Date; end: Date },
  forHuman: string[] = []
) => `## Problem

Production logged **${problem.count}** error(s) of this kind between ${range.start.toISOString()} and ${range.end.toISOString()}.

- Error class: \`${problem.errorClass}\`
- Route: \`${problem.route}\`
- HTTP status: ${problem.status ?? "none"}
- Sources: ${problem.sources.join(", ")}
- Fingerprint: \`${problem.fingerprint}\`

The scout copies no log text. Read the service's logs for this route and class to find the cause.
${forHuman.length === 0 ? "" : `\n## Needs a human\n\nThe scout didn't hand this to Duo:\n\n${forHuman.map((r) => `- ${r}`).join("\n")}\n`}
## Desired outcome

The error stops: its rate drops by at least 80% in production after the fix deploys. The scout measures that, labels this issue verified, or reopens it.

## Constraints

- Start with a test that fails without the fix (AGENTS.md).
- Keep the change under ${MAX_FILES} files and ${MAX_LINES} lines, and inside the low-risk application source and tests that apps/ops/src/guardrails.ts allows (no auth, routes, connections, Meta, launch or optimizer code); anything else needs a human to merge it.
- Work on a branch whose name starts with this issue's number, and write \`Closes #N\` (N is this issue's number) in the merge request description, so GitLab links the two.
- Auto-merge is set by the loop after Duo Code Review leaves no open threads and the pipeline is green.

## Open questions

What the logs don't settle: the root cause is a suggestion until a test reproduces it.

${marker("issue")}`;

const rate = (w: Window) =>
  w.requests === 0
    ? "no requests"
    : `${w.errors}/${w.requests} requests (${((w.errors / w.requests) * 100).toFixed(2)}%)`;

export const verdictNote = (
  verdict: "regressed" | "verified",
  before: Window,
  after: Window
) =>
  `${verdict === "verified" ? "Verified in production: the error rate dropped." : "Not fixed: the error still occurs in production."}

| Window | Errors per request |
| --- | --- |
| 24 h before the merge | ${rate(before)} |
| Since the deploy | ${rate(after)} |

Sources: Cloud Logging (the service's structured error lines, Cloud Run service \`app\`), GitLab Observability \`mcp.request\` error spans when its API key is set, and Cloud Monitoring \`run.googleapis.com/request_count\`.

${marker(verdict)}`;
