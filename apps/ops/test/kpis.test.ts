import { describe, expect, it } from "vitest";

import { gapOf, kpiReport, loadKpis, rank } from "../src/kpis.ts";
import type { Kpi } from "../src/kpis.ts";

const kpi = (overrides: Partial<Kpi>): Kpi => ({
  direction: "down",
  id: "x",
  name: "X",
  source: { kind: "ui", measure: "lcp", page: "/" },
  target: 100,
  unit: "ms",
  weight: 1,
  why: "",
  ...overrides,
});

describe("the checked-in KPI file", () => {
  it("parses, with unique ids", async () => {
    const file = await loadKpis();
    const ids = file.kpis.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("gapOf", () => {
  it("measures misses in the KPI's direction, and nothing for a hit", () => {
    expect(gapOf(kpi({}), 150)).toBe(0.5);
    expect(gapOf(kpi({}), 50)).toBe(0);
    expect(gapOf(kpi({ direction: "up", target: 0.9 }), 0.45)).toBeCloseTo(0.5);
  });

  it("stays finite against a zero target", () => {
    expect(gapOf(kpi({ target: 0 }), 3)).toBe(3);
    expect(gapOf(kpi({ target: 0 }), 1000)).toBe(10);
  });
});

describe("rank", () => {
  it("puts the biggest weighted miss first and missing data last", () => {
    const ranked = rank([
      { kpi: kpi({ id: "small" }), value: 120 },
      { kpi: kpi({ id: "none" }), value: undefined },
      { kpi: kpi({ id: "big", weight: 3 }), value: 150 },
      { kpi: kpi({ id: "fine" }), value: 10 },
    ]);
    expect(ranked.map((s) => s.kpi.id)).toStrictEqual([
      "big",
      "small",
      "fine",
      "none",
    ]);
    expect(kpiReport(ranked, new Date(0), 7)).toContain("misses target");
  });
});
