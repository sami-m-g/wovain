import { describe, expect, it } from "vitest";

import {
  autoMergeable,
  blockers,
  diffLines,
  openThreads,
  reviewedShaOf,
} from "../src/guardrails.ts";

describe("autoMergeable", () => {
  it.each([
    "apps/web/src/lib/checkout/quote.ts",
    "apps/web/test/quote.test.ts",
    "packages/api/src/routers/index.ts",
  ])("allows %s", (path) => {
    expect(autoMergeable(path)).toBe(true);
  });

  it.each([
    "apps/web/src/app/api/auth/[...all]/route.ts",
    "apps/web/src/lib/feature-flags.ts",
    "apps/web/src/lib/checkout/catalog.ts",
    "apps/web/src/lib/evlog.ts",
    "apps/web/src/env.server.ts",
    "apps/web/package.json",
    "apps/web/.env.schema",
    "packages/db/src/schema/auth.ts",
    "infra/duo.ts",
    ".gitlab-ci.yml",
    "apps/ops/src/guardrails.ts",
  ])("denies %s", (path) => {
    expect(autoMergeable(path)).toBe(false);
  });
});

const ok = {
  draft: false,
  hasConflicts: false,
  lines: 20,
  outsiders: [],
  paths: ["apps/web/src/lib/checkout/quote.ts"],
  pipeline: "running",
  reviewedSha: "abc",
  reviewerState: "reviewed",
  sha: "abc",
  unresolved: 0,
};

describe("blockers", () => {
  it("lets a reviewed, small, in-scope MR through", () => {
    expect(blockers(ok)).toStrictEqual([]);
  });

  it("lists every reason to wait for a person", () => {
    expect(
      blockers({
        ...ok,
        lines: 500,
        outsiders: ["stranger"],
        pipeline: "failed",
        reviewedSha: "old",
        unresolved: 1,
      })
    ).toHaveLength(5);
  });
});

describe("diffLines", () => {
  it("counts added and removed lines, not headers", () => {
    expect(diffLines("--- a/x\n+++ b/x\n@@\n-a\n+b\n c")).toBe(2);
  });
});

const thread = (author: string, resolved: boolean) => ({
  notes: [
    {
      author: { username: author },
      resolvable: true,
      resolved,
      system: false,
    },
  ],
});

describe("openThreads", () => {
  it("counts the reviewer's unresolved threads only", () => {
    expect(
      openThreads(
        [thread("duo", false), thread("duo", true), thread("someone", false)],
        "duo"
      )
    ).toBe(1);
  });
});

describe("reviewedShaOf", () => {
  const versions = [
    { createdAt: "2026-10-25T10:00:00Z", headSha: "one" },
    { createdAt: "2026-10-25T11:00:00Z", headSha: "two" },
  ];

  it("uses a diff note's commit", () => {
    expect(
      reviewedShaOf(
        [{ author: "duo", createdAt: "2026-10-25T10:30:00Z", headSha: "one" }],
        versions,
        "duo"
      )
    ).toBe("one");
  });

  it("maps a general note to the version current when it was written", () => {
    expect(
      reviewedShaOf(
        [
          {
            author: "duo",
            createdAt: "2026-10-25T11:30:00Z",
            headSha: undefined,
          },
        ],
        versions,
        "duo"
      )
    ).toBe("two");
    expect(reviewedShaOf([], versions, "duo")).toBeUndefined();
  });
});
