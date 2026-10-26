import { describe, expect, it } from "vitest";

import { MAX_REREVIEWS, rereviewOf } from "../src/rereview.ts";

const ready = {
  asked: 0,
  askedForThis: false,
  draft: false,
  openThreads: 0,
  pipeline: "success",
  requestId: 42,
  state: "requested_changes",
};

describe("rereviewOf", () => {
  it("re-requests once every thread is resolved and the pipeline passed", () => {
    expect(rereviewOf(ready)).toStrictEqual({ action: "rereview" });
  });

  it.each([
    [{ state: "approved" }, "Duo doesn't request changes"],
    [{ state: "unreviewed" }, "Duo doesn't request changes"],
    [{ requestId: undefined }, "Duo doesn't request changes"],
    [{ askedForThis: true }, "re-review already requested"],
    [{ draft: true }, "draft"],
    [{ openThreads: 2 }, "2 unresolved Duo thread(s)"],
    [{ pipeline: "running" }, "pipeline running"],
    [{ pipeline: "failed" }, "pipeline failed"],
    [{ pipeline: undefined }, "pipeline missing"],
  ])("waits for %o", (overrides, reason) => {
    expect(rereviewOf({ ...ready, ...overrides })).toStrictEqual({
      action: "wait",
      reason,
    });
  });

  it("hands over to a person after the cap", () => {
    expect(rereviewOf({ ...ready, asked: MAX_REREVIEWS })).toStrictEqual({
      action: "cap",
    });
    expect(rereviewOf({ ...ready, asked: MAX_REREVIEWS - 1 })).toStrictEqual({
      action: "rereview",
    });
  });
});
