import { describe, expect, it } from "vitest";

import { splitOf } from "../src/cloudrun.ts";
import {
  canaryVerdict,
  cleanupBody,
  cleanupMarker,
  guardDecision,
  hygieneFindings,
} from "../src/release.ts";
import type { GitLabFlag } from "../src/release.ts";

const now = new Date("2026-10-26T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(now.getTime() - m * 60_000).toISOString();
const daysAgo = (d: number) => minutesAgo(d * 24 * 60);

const flag = (overrides: Partial<GitLabFlag>): GitLabFlag => ({
  active: true,
  name: "mastra-runs",
  strategies: [
    { name: "default", scopes: [{ environment_scope: "production" }] },
  ],
  updated_at: daysAgo(1),
  ...overrides,
});

const healthy = { errors: 0, requests: 100 };
const ok = (path: string) => ({ path, status: 200 });

describe("canaryVerdict", () => {
  it("promotes a canary that answers and errs no more than stable", () => {
    expect(
      canaryVerdict({
        canary: { errors: 1, requests: 50 },
        probes: [ok("/"), ok("/api/auth/ok")],
        stable: healthy,
      })
    ).toEqual({ reasons: [], verdict: "promote" });
  });

  it("rolls back on failed probes", () => {
    const result = canaryVerdict({
      canary: healthy,
      probes: [
        { path: "/api/checkout/quote", status: 500 },
        { path: "/api/checkout/quote", status: 500 },
        ok("/"),
      ],
      stable: healthy,
    });
    expect(result.verdict).toBe("rollback");
    expect(result.reasons[0]).toContain("/api/checkout/quote (500)");
  });

  it("rolls back on a 5xx rate well over stable's", () => {
    const result = canaryVerdict({
      canary: { errors: 6, requests: 40 },
      probes: [ok("/")],
      stable: { errors: 1, requests: 400 },
    });
    expect(result.verdict).toBe("rollback");
  });

  it("doesn't blame the canary for errors stable has too", () => {
    expect(
      canaryVerdict({
        canary: { errors: 5, requests: 50 },
        probes: [ok("/")],
        stable: { errors: 60, requests: 500 },
      }).verdict
    ).toBe("promote");
  });
});

describe("guardDecision", () => {
  const degraded = { errors: 30, requests: 100 };
  const base = {
    actions: [],
    deployedAt: undefined,
    exceptions: 0,
    firingKpis: [],
    flags: [],
    health: healthy,
    now,
  };

  it("does nothing while production is healthy", () => {
    expect(guardDecision(base).action).toBe("none");
  });

  it("switches off the guarded flag that changed most recently", () => {
    const decision = guardDecision({
      ...base,
      flags: [
        flag({ name: "app-ui-v2", updated_at: minutesAgo(50) }),
        flag({ name: "fault-injection-checkout", updated_at: minutesAgo(5) }),
        // Not guarded: a kill switch for a dependency.
        flag({ name: "trends-qloo", updated_at: minutesAgo(1) }),
        // Already off.
        flag({ active: false, name: "autopilot", updated_at: minutesAgo(1) }),
      ],
      health: degraded,
    });
    expect(decision).toMatchObject({
      action: "flag-off",
      flag: "fault-injection-checkout",
    });
  });

  it("rolls back a recent deploy when no flag changed", () => {
    expect(
      guardDecision({
        ...base,
        deployedAt: new Date(minutesAgo(20)),
        health: degraded,
      }).action
    ).toBe("rollback");
  });

  it("never moves traffic for a KPI alert alone", () => {
    expect(
      guardDecision({
        ...base,
        deployedAt: new Date(minutesAgo(20)),
        firingKpis: ["checkout-quote-success"],
      }).action
    ).toBe("none");
  });

  it("switches off a fresh flag for a firing KPI alert", () => {
    expect(
      guardDecision({
        ...base,
        firingKpis: ["checkout-quote-success"],
        flags: [flag({ name: "app-ui-v2", updated_at: minutesAgo(30) })],
      }).action
    ).toBe("flag-off");
  });

  it("cools down for an hour and stops at three actions a day", () => {
    const changed = [flag({ updated_at: minutesAgo(5) })];
    expect(
      guardDecision({
        ...base,
        actions: [new Date(minutesAgo(30))],
        flags: changed,
        health: degraded,
      }).action
    ).toBe("none");
    expect(
      guardDecision({
        ...base,
        actions: [minutesAgo(70), minutesAgo(200), minutesAgo(300)].map(
          (d) => new Date(d)
        ),
        flags: changed,
        health: degraded,
      }).action
    ).toBe("none");
  });
});

describe("hygieneFindings", () => {
  it("flags expired, finished, unknown and missing flags", () => {
    const findings = hygieneFindings(
      [
        flag({ name: "app-ui-v2", updated_at: daysAgo(20) }),
        flag({ name: "trends-tavily", updated_at: daysAgo(30) }),
        flag({ name: "legacy-thing" }),
      ],
      new Date("2026-11-10T00:00:00Z")
    );
    const byFlag = Object.fromEntries(findings.map((f) => [f.flag, f.problem]));
    // A release flag serving all of production for 14+ days.
    expect(byFlag["app-ui-v2"]).toBe("fully-rolled-out");
    // A kill switch on for everyone is normal.
    expect(byFlag["trends-tavily"]).toBeUndefined();
    expect(byFlag["legacy-thing"]).toBe("not-in-registry");
    expect(byFlag["billing-polar"]).toBe("not-in-gitlab");
  });

  it("flags trends-qloo once Qloo's judging window has passed", () => {
    const finding = hygieneFindings(
      [flag({ name: "trends-qloo" })],
      new Date("2026-11-06T00:00:00Z")
    ).find((f) => f.flag === "trends-qloo");
    expect(finding?.problem).toBe("expired");
    if (finding !== undefined) {
      expect(cleanupBody(finding)).toContain(cleanupMarker(finding));
    }
  });
});

describe("splitOf", () => {
  it("finds the canary by tag and the stable revision by traffic", () => {
    expect(
      splitOf([
        { percent: 90, revision: "web-00041" },
        {
          percent: 10,
          revision: "web-00042",
          tag: "canary",
          uri: "https://canary---web.a.run.app",
        },
      ])
    ).toEqual({
      canary: {
        percent: 10,
        revision: "web-00042",
        tag: "canary",
        uri: "https://canary---web.a.run.app",
      },
      stable: {
        percent: 90,
        revision: "web-00041",
        tag: undefined,
        uri: undefined,
      },
    });
  });
});
