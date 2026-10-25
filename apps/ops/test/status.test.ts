import { describe, expect, it } from "vitest";

import { doraOf, healthOf, renderStatus } from "../src/status.ts";

const now = new Date("2026-10-25T12:00:00Z");
const incident = {
  closedAt: "2026-10-24T12:30:00Z",
  createdAt: "2026-10-24T12:00:00Z",
  iid: 3,
  state: "closed" as const,
  title: "Incident: heal: ZodError on GET /api/checkout/quote (500)",
};
const incidents = [incident];

describe("doraOf", () => {
  it("computes frequency, failure rate and time to restore", () => {
    const dora = doraOf({
      deployments: Array.from({ length: 30 }, () => ({
        createdAt: "2026-10-20T00:00:00Z",
      })),
      incidents,
      leadTimeSeconds: 7200,
      now,
    });
    expect(dora.deploymentsPerWeek).toBeCloseTo(7);
    expect(dora.changeFailureRate).toBeCloseTo(1 / 30);
    expect(dora.meanHoursToRestore).toBeCloseTo(0.5);
    expect(dora.leadTimeHours).toBe(2);
  });

  it("has no rates without deployments or closed incidents", () => {
    const dora = doraOf({
      deployments: [],
      incidents: [],
      leadTimeSeconds: undefined,
      now,
    });
    expect(dora.changeFailureRate).toBeUndefined();
    expect(dora.meanHoursToRestore).toBeUndefined();
  });
});

describe("healthOf", () => {
  it("ranks an open incident over recent errors", () => {
    expect(healthOf(1, 0)).toBe("incident");
    expect(healthOf(0, 4)).toBe("degraded");
    expect(healthOf(0, 0)).toBe("operational");
  });
});

describe("renderStatus", () => {
  it("escapes titles and lists incidents", () => {
    const html = renderStatus({
      dora: doraOf({
        deployments: [],
        incidents,
        leadTimeSeconds: undefined,
        now,
      }),
      generatedAt: now,
      health: "operational",
      incidents: [{ ...incident, title: "<script>x</script>" }],
      sciPerThousand: 1.234,
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("1.23 g");
    expect(html).toContain("30 min");
  });
});
