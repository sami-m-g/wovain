import { describe, expect, it } from "vitest";

import {
  autoMergeable,
  blockers,
  diffLines,
  provenanceGaps,
  reviewedShaOf,
} from "../src/guardrails.ts";
import type { Candidate, Provenance } from "../src/guardrails.ts";

const ok: Candidate = {
  draft: false,
  hasConflicts: false,
  lines: 40,
  paths: ["apps/server/src/lib/fal-pricing.ts"],
  pipeline: "running",
  provenance: [],
  reviewedSha: "abc",
  sha: "abc",
  unresolved: 0,
};

describe("autoMergeable (allowlist)", () => {
  it.each([
    "apps/server/src/lib/fal-pricing.ts",
    "apps/server/src/tools/design.ts",
    "apps/server/test/unit/fal-pricing.test.ts",
    "apps/widgets/src/design/design-widget-view.tsx",
    "packages/shared/src/economics.ts",
  ])("lets %s through", (path) => {
    expect(autoMergeable(path)).toBe(true);
  });

  it.each([
    "apps/ops/src/guardrails.ts",
    "apps/ops/test/guardrails.test.ts",
    "infra/index.ts",
    "apps/server/src/auth/auth.ts",
    "apps/server/src/routes/mcp.ts",
    "apps/server/src/store.ts",
    ".gitlab-ci.yml",
    ".gitlab/ci/deploy.yml",
    ".gitlab/CODEOWNERS",
    "apphosting.yaml",
    "apps/server/package.json",
    "apps/server/tsconfig.json",
    "apps/server/vitest.config.ts",
    "apps/widgets/vite.config.ts",
    "apps/widgets/src/.env",
    "pnpm-lock.yaml",
    "apps/server/firestore.rules",
    ".agents/skills/issue/SKILL.md",
    ".claude/settings.json",
    "AGENTS.md",
    "README.md",
    "docs/loop.md",
    "oxlint.config.ts",
    "lefthook.yml",
  ])("keeps %s for a human", (path) => {
    expect(autoMergeable(path)).toBe(false);
    expect(blockers({ ...ok, paths: [path] })).toHaveLength(1);
  });
});

describe("blockers", () => {
  it("lets a small, reviewed fix of the loop's own issue through", () => {
    expect(blockers(ok)).toEqual([]);
  });

  it("stops large, conflicted, failing or unproven changes", () => {
    const reasons = blockers({
      ...ok,
      draft: true,
      hasConflicts: true,
      lines: 900,
      paths: Array.from({ length: 12 }, (_, i) => `apps/server/src/f${i}.ts`),
      pipeline: "failed",
      provenance: ["no Developer session"],
      unresolved: 2,
    });
    expect(reasons).toHaveLength(7);
  });

  it("needs a review of the head commit, not an older one", () => {
    expect(blockers({ ...ok, reviewedSha: "old" })).toEqual([
      "Duo Code Review hasn't reviewed the head commit",
    ]);
    expect(blockers({ ...ok, reviewedSha: undefined })).toHaveLength(1);
  });
});

describe("reviewedShaOf", () => {
  const R = "duo-code-review-gitlab-ai-hackathon";
  const versions = [
    { createdAt: "2026-10-22T10:00:00Z", headSha: "v1" },
    { createdAt: "2026-10-22T12:00:00Z", headSha: "v2" },
  ];

  it("takes the head commit a diff note names", () => {
    expect(
      reviewedShaOf(
        [{ author: R, createdAt: "2026-10-22T13:00:00Z", headSha: "v2" }],
        versions,
        R
      )
    ).toBe("v2");
  });

  it("matches a general note to the version current when it was written", () => {
    expect(
      reviewedShaOf(
        [{ author: R, createdAt: "2026-10-22T11:00:00Z", headSha: undefined }],
        versions,
        R
      )
    ).toBe("v1");
  });

  it("ignores other authors and returns nothing without a review", () => {
    expect(
      reviewedShaOf(
        [
          {
            author: "someone",
            createdAt: "2026-10-22T13:00:00Z",
            headSha: "v2",
          },
        ],
        versions,
        R
      )
    ).toBeUndefined();
  });
});

describe("provenanceGaps", () => {
  const LOOP = "sami-m-g";
  const DEV = "duo-developer-gitlab-ai-hackathon";
  const good: Provenance = {
    developer: DEV,
    issue: {
      assignedAt: "2026-10-22T10:00:00Z",
      assignees: [DEV],
      author: LOOP,
      fromLoop: true,
      iid: 42,
      labels: ["scout", "type::bug"],
    },
    loopUser: LOOP,
    mr: { author: DEV, closes: [42], iid: 7, sourceBranch: "fix-error" },
    sessions: [
      {
        createdAt: "2026-10-22T10:01:00Z",
        definition: "developer/v1",
        issue: 42,
        mergeRequests: [7],
        sourceType: "FLOW_TRIGGER",
        user: LOOP,
      },
    ],
  };

  it("accepts an MR the loop's assignment produced", () => {
    expect(provenanceGaps(good)).toEqual([]);
  });

  it("accepts a branch named for the issue instead of a closing link", () => {
    expect(
      provenanceGaps({
        ...good,
        mr: { ...good.mr, closes: [], sourceBranch: "42-fix-error" },
      })
    ).toEqual([]);
  });

  it("rejects an issue a person filed, even with the scout label", () => {
    expect(
      provenanceGaps({
        ...good,
        issue: { ...good.issue, author: "mallory", fromLoop: false },
      })
    ).toHaveLength(1);
  });

  it("rejects an MR a person wrote", () => {
    expect(
      provenanceGaps({ ...good, mr: { ...good.mr, author: "mallory" } })
    ).toHaveLength(1);
  });

  it("rejects an MR that only mentions the issue in its text", () => {
    expect(
      provenanceGaps({
        ...good,
        mr: { ...good.mr, closes: [], sourceBranch: "fix-error" },
      })
    ).toHaveLength(1);
  });

  it("rejects a session someone else started, or one from before the assignment", () => {
    const [session] = good.sessions;
    if (session === undefined) {
      throw new Error("no session");
    }
    expect(
      provenanceGaps({ ...good, sessions: [{ ...session, user: "mallory" }] })
    ).toHaveLength(1);
    expect(
      provenanceGaps({
        ...good,
        sessions: [{ ...session, createdAt: "2026-10-22T09:00:00Z" }],
      })
    ).toHaveLength(1);
    expect(
      provenanceGaps({
        ...good,
        sessions: [{ ...session, mergeRequests: [8] }],
      })
    ).toHaveLength(1);
  });
});

describe("diffLines", () => {
  it("counts added and removed lines, not the file headers", () => {
    expect(
      diffLines("--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n same")
    ).toBe(2);
  });
});
