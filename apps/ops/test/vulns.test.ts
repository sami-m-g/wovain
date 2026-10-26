import { describe, expect, it } from "vitest";

import type { Issue, Note } from "../src/gitlab.ts";
import { TASK_LABEL, hasAcceptanceCriteria } from "../src/intake.ts";
import {
  MAX_AUTO_RESOLVE_PER_RUN,
  MAX_OPEN_VULN_TASKS,
  MAX_VULN_FIXES_PER_DAY,
  VULN_LABEL,
  isUnavailable,
  pickGone,
  pickVulns,
  planVulnTasks,
  resolutionUnavailable,
  resolvedNote,
  startedMarker,
  startedVulns,
  taskedVulns,
  unavailableNote,
  vulnMergeRequests,
  vulnTaskBody,
  vulnTaskTitle,
} from "../src/vulns.ts";

const now = new Date("2026-10-25T12:00:00Z");
const vuln = (n: number, overrides = {}) => ({
  detectedAt: "2026-10-24T12:00:00Z",
  id: `gid://gitlab/Vulnerability/${n}`,
  mergeRequest: undefined,
  severity: "HIGH",
  ...overrides,
});
const note = (body: string, createdAt: string): Note => ({
  author: { username: "owner" },
  body,
  created_at: createdAt,
  id: 1,
  system: false,
});

describe("startedVulns", () => {
  it("reads the ops job's markers, not text that only looks like one", () => {
    const started = startedVulns([
      note(`Started\n\n${startedMarker(vuln(1).id)}`, "2026-10-25T10:00:00Z"),
      note("<!-- wovain:vuln:gid://evil/1 -->", "2026-10-25T10:00:00Z"),
    ]);
    expect([...started.keys()]).toStrictEqual([vuln(1).id]);
  });
});

describe("pickVulns", () => {
  it("picks new, unstarted findings without a fix, within the daily cap", () => {
    const picked = pickVulns(
      [
        vuln(1),
        vuln(2, { mergeRequest: 9 }),
        vuln(3, { detectedAt: "2026-09-01T00:00:00Z" }),
        vuln(4),
        vuln(5),
      ],
      new Map([[vuln(4).id, "2026-10-20T00:00:00Z"]]),
      now
    );
    expect(picked.map((v) => v.id)).toStrictEqual(
      [vuln(1).id, vuln(5).id].slice(0, MAX_VULN_FIXES_PER_DAY)
    );
  });

  it("starts nothing once today's cap is spent", () => {
    const started = new Map(
      Array.from({ length: MAX_VULN_FIXES_PER_DAY }, (_, i) => [
        vuln(100 + i).id,
        "2026-10-25T09:00:00Z",
      ])
    );
    expect(pickVulns([vuln(1)], started, now)).toStrictEqual([]);
  });
});

const finding = (n: number, overrides = {}) => ({
  ...vuln(n),
  file: "apps/web/src/x.ts",
  identifiers: ["cwe:601"],
  line: "12",
  title: "URL redirection to untrusted site",
  webUrl: `https://gitlab.com/p/-/security/vulnerabilities/${n}`,
  ...overrides,
});
const task = (n: number, overrides: Partial<Issue> = {}): Issue => ({
  assignees: [],
  author: { username: "owner" },
  closed_at: null,
  created_at: "2026-10-20T00:00:00Z",
  description: vulnTaskBody(finding(n)),
  id: 1000 + n,
  iid: n,
  issue_type: "issue",
  labels: [TASK_LABEL, VULN_LABEL],
  state: "opened",
  title: "t",
  web_url: `https://gitlab.com/p/-/issues/${n}`,
  ...overrides,
});

const closed = (at: string) => task(1, { closed_at: at, state: "closed" });

describe("Vulnerability Resolution fallback", () => {
  it("recognises GitLab's 'not available' answer, not other failures", () => {
    expect(
      isUnavailable(
        "GitLab GraphQL: AI features are not enabled or resource is not permitted to be sent."
      )
    ).toBe(true);
    expect(isUnavailable("GitLab GraphQL: 502")).toBe(false);
  });

  it("skips Vulnerability Resolution for a week after it was unavailable", () => {
    const body = unavailableNote("AI features are not enabled");
    expect(
      resolutionUnavailable([note(body, "2026-10-20T12:00:00Z")], now)
    ).toBe(true);
    expect(
      resolutionUnavailable([note(body, "2026-10-10T12:00:00Z")], now)
    ).toBe(false);
  });

  it("files one issue per finding that intake accepts", () => {
    const body = vulnTaskBody(finding(1));
    expect(hasAcceptanceCriteria(body)).toBe(true);
    expect([...taskedVulns([task(1)]).keys()]).toStrictEqual([finding(1).id]);
    expect(vulnTaskTitle(finding(1))).toBe(
      "Fix high SAST finding: URL redirection to untrusted site in apps/web/src/x.ts"
    );
  });

  it("deduplicates, skips findings with a fix, and caps open issues", () => {
    const plan = planVulnTasks({
      now,
      tasks: [task(1)],
      vulns: [
        finding(1),
        finding(2, { mergeRequest: 5 }),
        finding(3),
        finding(4),
        finding(5),
      ],
    });
    expect(plan.open).toBe(1);
    expect(plan.create.map((v) => v.id)).toStrictEqual(
      [finding(3).id, finding(4).id, finding(5).id].slice(
        0,
        MAX_OPEN_VULN_TASKS - 1
      )
    );
    expect(plan.reopen).toStrictEqual([]);
  });

  it("reopens a closed issue whose finding is still reported, after a day", () => {
    expect(
      planVulnTasks({
        now,
        tasks: [closed("2026-10-23T00:00:00Z")],
        vulns: [finding(1)],
      }).reopen.map((r) => r.issue.iid)
    ).toStrictEqual([1]);
    expect(
      planVulnTasks({
        now,
        tasks: [closed("2026-10-25T08:00:00Z")],
        vulns: [finding(1)],
      })
    ).toStrictEqual({ create: [], open: 0, reopen: [] });
  });

  it("ignores issues without agent::task and markers in other text", () => {
    const tasked = taskedVulns([
      task(1, { labels: [VULN_LABEL] }),
      task(2, { description: "<!-- wovain:vuln-task:gid://evil/1 -->" }),
    ]);
    expect(tasked.size).toBe(0);
  });
});

const gone = (n: number, resolvedOnDefaultBranch = true) => ({
  id: `gid://gitlab/Vulnerability/${n}`,
  resolvedOnDefaultBranch,
  severity: "HIGH",
  webUrl: `https://gitlab.com/p/-/security/vulnerabilities/${n}`,
});

describe("auto-resolve", () => {
  it("picks only findings GitLab no longer detects", () => {
    expect(pickGone([gone(1), gone(2, false), gone(3)])).toStrictEqual([
      gone(1),
      gone(3),
    ]);
  });

  it("resolves at most MAX_AUTO_RESOLVE_PER_RUN a run", () => {
    const many = Array.from({ length: 25 }, (_, i) => gone(i));
    expect(pickGone(many)).toHaveLength(MAX_AUTO_RESOLVE_PER_RUN);
    expect(pickGone(many)[0]).toStrictEqual(gone(0));
  });

  it("logs each finding with its link and a marker", () => {
    const body = resolvedNote(gone(7));
    expect(body).toContain(gone(7).webUrl);
    expect(body).toContain(`<!-- wovain:vuln-resolved:${gone(7).id} -->`);
  });
});

describe("vulnMergeRequests", () => {
  it("returns only the merge requests of findings the ops job started", () => {
    expect(
      vulnMergeRequests(
        [vuln(1, { mergeRequest: 7 }), vuln(2, { mergeRequest: 8 })],
        new Map([[vuln(1).id, "2026-10-25T09:00:00Z"]])
      )
    ).toStrictEqual([7]);
  });
});
