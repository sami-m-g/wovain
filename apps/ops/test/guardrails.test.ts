import { describe, expect, it } from "vitest";

import { blockers, diffLines } from "../src/guardrails.ts";
import type { Candidate } from "../src/guardrails.ts";

const ok: Candidate = {
  closesScoutIssue: true,
  draft: false,
  hasConflicts: false,
  lines: 40,
  paths: ["apps/server/src/lib/fal-pricing.ts"],
  pipeline: "running",
  reviewed: true,
  unresolved: 0,
};

describe("blockers", () => {
  it("lets a small, reviewed fix for a scout issue through", () => {
    expect(blockers(ok)).toEqual([]);
  });

  it.each([
    "infra/index.ts",
    "apps/server/src/auth/auth.ts",
    ".gitlab-ci.yml",
    ".gitlab/ci/deploy.yml",
    "apphosting.yaml",
    "apps/server/package.json",
    "pnpm-lock.yaml",
    "apps/server/firestore.rules",
    ".agents/skills/issue/SKILL.md",
  ])("keeps %s for a human", (path) => {
    expect(blockers({ ...ok, paths: [path] })).toHaveLength(1);
  });

  it("stops large, unreviewed, conflicted or failing changes", () => {
    const reasons = blockers({
      ...ok,
      closesScoutIssue: false,
      draft: true,
      hasConflicts: true,
      lines: 900,
      paths: Array.from({ length: 12 }, (_, i) => `apps/server/src/f${i}.ts`),
      pipeline: "failed",
      reviewed: false,
      unresolved: 2,
    });
    expect(reasons).toHaveLength(8);
  });
});

describe("diffLines", () => {
  it("counts added and removed lines, not the file headers", () => {
    expect(
      diffLines("--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n same")
    ).toBe(2);
  });
});
