import { describe, expect, it } from "vitest";

import { TEST_FILE, judgeRepro, parseReport } from "../src/repro.ts";

const signature = {
  fingerprint: "abc123abc123",
  message: "price: expected object, received null",
  name: "ZodError",
};
const run = (status: string, failure = "") => [
  { failure, name: "heal abc123abc123 prices unpriced variants", status },
];

describe("judgeRepro", () => {
  it("passes a test that fails before the fix with the error and passes after", () => {
    const verdict = judgeRepro(
      signature,
      run("failed", "ZodError: price: expected object, received null"),
      run("passed")
    );
    expect(verdict.problems).toStrictEqual([]);
    expect(verdict.notes[0]).toContain("original message");
  });

  it("fails without a test named for the signature", () => {
    expect(judgeRepro(signature, [], []).problems[0]).toContain(
      "no test named"
    );
  });

  it("fails a test that already passes without the fix", () => {
    expect(
      judgeRepro(signature, run("passed"), run("passed")).problems[0]
    ).toContain("doesn't reproduce");
  });

  it("fails a test that reproduces a different error", () => {
    expect(
      judgeRepro(signature, run("failed", "TypeError: nope"), run("passed"))
        .problems[0]
    ).toContain("not with ZodError");
  });

  it("fails when the fix doesn't make it pass", () => {
    expect(
      judgeRepro(signature, run("failed", "ZodError: x"), run("failed"))
        .problems
    ).toHaveLength(1);
  });
});

describe("parseReport", () => {
  it("reads vitest's JSON report", () => {
    expect(
      parseReport({
        testResults: [
          {
            assertionResults: [
              {
                failureMessages: ["ZodError: x"],
                fullName: "heal f works",
                status: "failed",
              },
            ],
          },
        ],
      })
    ).toStrictEqual([
      { failure: "ZodError: x", name: "heal f works", status: "failed" },
    ]);
  });
});

describe("TEST_FILE", () => {
  it("matches package test files only", () => {
    expect(TEST_FILE.test("apps/web/test/quote.test.ts")).toBe(true);
    expect(TEST_FILE.test("apps/web/src/lib/checkout/quote.ts")).toBe(false);
  });
});
