import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { describeProblem } from "@/lib/flow-client";

describe("describeProblem", () => {
  it("shows a step's precondition with the server's why and fix", () => {
    const error = new ORPCError("PRECONDITION_FAILED", {
      data: {
        fix: "Reconnect Fourthwall, then try again.",
        why: "Found blanks for 0 of 5 products.",
      },
      message: "Fourthwall's catalog had too few blanks for this drop",
      status: 412,
    });
    expect(describeProblem(error)).toEqual({
      fix: "Reconnect Fourthwall, then try again.",
      kind: "limit",
      message:
        "Fourthwall's catalog had too few blanks for this drop. Found blanks for 0 of 5 products",
    });
  });
});
