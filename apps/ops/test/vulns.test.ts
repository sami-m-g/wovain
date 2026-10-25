import { describe, expect, it } from "vitest";

import type { Note } from "../src/gitlab.ts";
import {
  MAX_VULN_FIXES_PER_DAY,
  pickVulns,
  startedMarker,
  startedVulns,
  vulnMergeRequests,
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
