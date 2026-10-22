import { describe, expect, it } from "vitest";

import { sciOf, sciReport } from "../src/sci.ts";

// The week measured on 2026-10-22 (Cloud Monitoring and the GitLab API).
const week = {
  ciSeconds: 31_335,
  instanceSeconds: 154.7,
  mainPipelines: 65,
  requests: 58,
};

describe("sciOf", () => {
  it("adds the four parts into grams per run", () => {
    const { parts, secondsPerRequest, total } = sciOf(week);
    expect(secondsPerRequest).toBeCloseTo(2.667, 2);
    expect(parts.map((p) => p.name)).toHaveLength(4);
    expect(total).toBeCloseTo(
      parts.reduce((sum, p) => sum + p.grams, 0),
      10
    );
    expect(total).toBeCloseTo(14.27, 1);
  });

  it("counts no server energy without traffic", () => {
    const { parts } = sciOf({ ...week, instanceSeconds: 0, requests: 0 });
    expect(parts[0]?.grams).toBe(0);
  });

  it("grows with CI time", () => {
    expect(sciOf({ ...week, ciSeconds: 62_670 }).total).toBeGreaterThan(
      sciOf(week).total
    );
  });
});

describe("sciReport", () => {
  it("states the number, the formula and the labeled sources", () => {
    const report = sciReport(week, new Date("2026-10-22T00:00:00Z"));
    expect(report).toContain("gCO2e per run");
    expect(report).toContain("((E × I) + M) per R");
    expect(report).toContain("unverified estimates");
  });
});
