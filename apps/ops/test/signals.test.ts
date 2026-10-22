import { describe, expect, it } from "vitest";

import { fingerprintIn, issueBody } from "../src/report.ts";
import {
  decideVerification,
  groupSignals,
  normalize,
  redact,
  tally,
} from "../src/signals.ts";

describe("normalize", () => {
  it("groups the same error with different ids and numbers", () => {
    expect(normalize("fal generate failed for d12 after 3021ms")).toBe(
      normalize("fal generate failed for d7 after 88ms")
    );
    expect(
      normalize("GET /mcp?session=0f3a9c2b-1d4e-4f5a-8b6c-7d8e9f0a1b2c")
    ).toBe("get /mcp");
  });

  it("keeps only the first line of a stack", () => {
    expect(normalize("TypeError: x is undefined\n    at foo (a.ts:1:2)")).toBe(
      "typeerror: x is undefined"
    );
  });
});

describe("redact", () => {
  it("removes tokens, keys and emails", () => {
    const out = redact(
      "auth failed for jane@example.com Bearer abc.def api_key=sk-12345 token: eyJhbGciOi.eyJzdWIi.c2ln"
    );
    expect(out).not.toContain("jane@example.com");
    expect(out).not.toContain("abc.def");
    expect(out).not.toContain("sk-12345");
    expect(out).not.toContain("eyJhbGciOi");
  });

  it("clips long samples", () => {
    expect(redact("x ".repeat(400)).length).toBeLessThanOrEqual(300);
  });
});

describe("groupSignals", () => {
  it("merges one error seen by two sources, biggest first", () => {
    const logs = tally("Cloud Logging", [
      { key: "log boom", sample: "boom", title: "boom" },
      { key: "log boom", sample: "boom", title: "boom" },
      { key: "log rare", sample: "rare", title: "rare" },
    ]);
    const spans = tally("GitLab Observability traces", [
      { key: "log boom", sample: "boom", title: "boom" },
    ]);
    const [top, next] = groupSignals([...logs, ...spans]);
    expect(top?.count).toBe(3);
    expect(top?.sources).toEqual([
      "Cloud Logging",
      "GitLab Observability traces",
    ]);
    expect(next?.count).toBe(1);
  });

  it("writes a fingerprint the next run can find", () => {
    const [problem] = groupSignals(
      tally("Cloud Logging", [{ key: "k", sample: "s", title: "t" }])
    );
    if (problem === undefined) {
      throw new Error("no problem");
    }
    const body = issueBody(problem, { end: new Date(1), start: new Date(0) });
    expect(fingerprintIn(body)).toBe(problem.fingerprint);
  });
});

describe("decideVerification", () => {
  const before = { errors: 20, requests: 100 };

  it("waits for time and traffic", () => {
    expect(
      decideVerification({
        after: { errors: 0, requests: 50 },
        before,
        hoursSinceDeploy: 1,
      })
    ).toBe("wait");
    expect(
      decideVerification({
        after: { errors: 0, requests: 2 },
        before,
        hoursSinceDeploy: 5,
      })
    ).toBe("wait");
  });

  it("verifies when the rate drops by 80% or more", () => {
    expect(
      decideVerification({
        after: { errors: 1, requests: 100 },
        before,
        hoursSinceDeploy: 3,
      })
    ).toBe("verified");
  });

  it("reports a regression only after a day of no drop", () => {
    const after = { errors: 15, requests: 100 };
    expect(decideVerification({ after, before, hoursSinceDeploy: 3 })).toBe(
      "wait"
    );
    expect(decideVerification({ after, before, hoursSinceDeploy: 25 })).toBe(
      "regressed"
    );
  });
});
