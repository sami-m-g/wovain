import { describe, expect, it } from "vitest";

import { ago, cents, isUnavailable, percent, routeOf } from "./format";

describe("routeOf", () => {
  it("opens the tab the server named", () => {
    expect(routeOf({ url: "/approvals" })).toBe("/approvals");
    expect(routeOf({ url: "/kpis" })).toBe("/kpis");
  });

  it("falls back to the inbox for anything else", () => {
    expect(routeOf({ url: "https://evil.example" })).toBe("/");
    expect(routeOf({ url: 3 })).toBe("/");
    expect(routeOf(null)).toBe("/");
  });
});

describe("formatting", () => {
  it("formats cents as dollars", () => {
    expect(cents(1250)).toBe("$12.50");
  });

  it("shows a dash for a missing percent", () => {
    expect(percent()).toBe("–");
    expect(percent(2.345)).toBe("2.3%");
  });

  it("says how long ago", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(ago("2026-10-28T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-10-28T11:55:00Z", now)).toBe("5m ago");
    expect(ago("2026-10-28T09:00:00Z", now)).toBe("3h ago");
    expect(ago("2026-10-26T12:00:00Z", now)).toBe("2d ago");
  });
});

describe("isUnavailable", () => {
  it("is true for a 404 only", () => {
    expect(isUnavailable({ status: 404 })).toBe(true);
    expect(isUnavailable({ status: 500 })).toBe(false);
    expect(isUnavailable(new Error("boom"))).toBe(false);
  });
});
