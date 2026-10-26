import { describe, expect, it } from "vitest";

import { TEST_FILE, judgeRepro, runsOf } from "../src/repro.ts";

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

describe("runsOf", () => {
  const modules = [
    {
      children: {
        allTests: () => [
          {
            fullName: "prices > heal f works",
            result: () => ({
              errors: [{ message: "x", stack: "ZodError: x\n  at a.ts:1" }],
              state: "failed",
            }),
          },
          {
            fullName: "heal f also works",
            result: () => ({ state: "passed" }),
          },
          {
            fullName: "no stack",
            result: () => ({ errors: [{ message: "boom" }], state: "failed" }),
          },
        ],
      },
    },
  ];

  it("names tests and words failures as vitest's JSON report did", () => {
    expect(runsOf(modules)).toStrictEqual([
      {
        failure: "ZodError: x\n  at a.ts:1",
        name: "prices heal f works",
        status: "failed",
      },
      { failure: "", name: "heal f also works", status: "passed" },
      { failure: "boom", name: "no stack", status: "failed" },
    ]);
  });
});

describe("TEST_FILE", () => {
  it("matches package test files only", () => {
    expect(TEST_FILE.test("apps/web/test/quote.test.ts")).toBe(true);
    expect(TEST_FILE.test("apps/web/src/lib/checkout/quote.ts")).toBe(false);
  });
});
