import { describe, expect, it } from "vitest";

import { sciOf, sciReport } from "../src/sci.ts";

const week = {
  ciSeconds: 6 * 3600,
  duoSessions: 10,
  instanceSeconds: 20 * 3600,
  requests: 50_000,
};

describe("sciOf", () => {
  it("sums the parts and scores per 1,000 requests", () => {
    const { parts, perThousand, total } = sciOf(week);
    expect(parts.map((p) => p.name)).toHaveLength(3);
    expect(total).toBeCloseTo(
      parts.reduce((sum, p) => sum + p.grams, 0),
      10
    );
    expect(perThousand).toBeCloseTo((total / 50_000) * 1000, 10);
  });

  it("has no per-request score without requests", () => {
    expect(sciOf({ ...week, requests: 0 }).perThousand).toBeUndefined();
    expect(sciReport({ ...week, requests: 0 }, new Date(0), 7)).toContain(
      "no requests"
    );
  });

  it("grows with Duo sessions", () => {
    expect(sciOf({ ...week, duoSessions: 20 }).total).toBeGreaterThan(
      sciOf(week).total
    );
  });
});
