import { describe, expect, it } from "vitest";

import {
  latestGreenBefore,
  tagMessage,
  tagName,
  submissions,
} from "../src/submissions.ts";
import type { MainPipeline } from "../src/submissions.ts";

const pipeline = (
  id: number,
  finishedAt: string | null,
  extra: Partial<MainPipeline> = {}
): MainPipeline => ({
  finishedAt,
  id,
  sha: `sha${id}`,
  source: "push",
  status: "success",
  webUrl: `https://gitlab.example/p/${id}`,
  ...extra,
});

const deadline = "2026-10-26T21:00:00Z";

describe("latestGreenBefore", () => {
  it("picks the newest green pipeline finished by the deadline", () => {
    const picked = latestGreenBefore(
      [
        pipeline(3, "2026-10-26T21:00:01Z"),
        pipeline(2, "2026-10-26T20:59:59Z"),
        pipeline(1, "2026-10-26T10:00:00Z"),
      ],
      deadline
    );
    expect(picked?.id).toBe(2);
  });

  it("includes a pipeline that finished exactly at the deadline", () => {
    expect(latestGreenBefore([pipeline(1, deadline)], deadline)?.id).toBe(1);
  });

  it("skips failed, unfinished and non-push pipelines", () => {
    const picked = latestGreenBefore(
      [
        pipeline(4, "2026-10-26T20:00:00Z", { source: "schedule" }),
        pipeline(3, "2026-10-26T19:00:00Z", { status: "failed" }),
        pipeline(2, null),
        pipeline(1, "2026-10-26T18:00:00Z"),
      ],
      deadline
    );
    expect(picked?.id).toBe(1);
  });

  it("finds nothing when no pipeline qualifies", () => {
    expect(
      latestGreenBefore([pipeline(1, "2026-10-27T00:00:00Z")], deadline)
    ).toBeUndefined();
  });
});

describe("tags", () => {
  it("names the tag and describes the commit in its message", () => {
    const [basics] = submissions;
    if (!basics) {
      throw new Error("no submissions");
    }
    expect(tagName(basics)).toBe("submission/basics");
    const message = tagMessage(basics, pipeline(7, deadline), "main@abc");
    expect(message).toContain(basics.deadline);
    expect(message).toContain("https://gitlab.example/p/7");
    expect(message).toContain("main@abc");
  });
});
