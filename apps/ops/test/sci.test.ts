import { describe, expect, it } from "vitest";

import { clipStats, clipStatsSchema } from "../src/clip-stats.ts";
import { sciJson, sciOf, sciReport } from "../src/sci.ts";

// The week measured on 2026-10-22 (Cloud Monitoring and the GitLab API).
const week = {
  ciSeconds: 31_335,
  clips: null,
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
    // One 5-second clip at the one-H100-minute fallback (no clips recorded).
    expect(total).toBeCloseTo(8.72, 1);
    expect(parts[3]?.basis).toContain("estimate: no recorded fal clips");
  });

  it("uses the weekly median of the GPU seconds fal reported", () => {
    const clips = clipStats(
      [16.4, 6, 9].map((gpuSeconds) => ({
        at: "2026-10-20T00:00:00Z",
        gpuSeconds,
      })),
      new Date("2026-10-22T00:00:00Z")
    );
    const { parts } = sciOf({ ...week, clips: clips ?? null });
    // 9 GPU-s × 700 W × PUE 1.1 at 432 g/kWh.
    expect(parts[3]?.grams).toBeCloseTo((9 * 700 * 1.1 * 432) / 3_600_000, 6);
    expect(parts[3]?.basis).toContain("over 3 fal clips in 30 days (measured)");
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

describe("clipStats", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  it("keeps only clips in the window, as count, median and p90", () => {
    const samples = [
      { at: "2026-10-21T00:00:00Z", gpuSeconds: 4 },
      { at: "2026-10-20T00:00:00Z", gpuSeconds: 8 },
      { at: "2026-10-19T00:00:00Z", gpuSeconds: 20 },
      { at: "2026-08-01T00:00:00Z", gpuSeconds: 500 },
    ];
    expect(clipStats(samples, now)).toEqual({
      at: now.toISOString(),
      count: 3,
      medianGpuSeconds: 8,
      p90GpuSeconds: 20,
      windowDays: 30,
    });
    expect(clipStats([], now)).toBeUndefined();
  });

  it("accepts only the aggregate shape from the artifact", () => {
    const stats = clipStats([{ at: now.toISOString(), gpuSeconds: 5 }], now);
    expect(clipStatsSchema.safeParse({ ...stats, samples: [5] }).success).toBe(
      false
    );
  });
});

describe("sciJson", () => {
  it("carries no per-merchant or per-clip array", () => {
    const clips = clipStats(
      [{ at: "2026-10-21T00:00:00Z", gpuSeconds: 7 }],
      new Date("2026-10-22T00:00:00Z")
    );
    const json: unknown = JSON.parse(
      sciJson(
        { ...week, clips: clips ?? null },
        new Date("2026-10-22T00:00:00Z")
      )
    );
    const arrays: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        arrays.push(path);
      }
      if (typeof value === "object" && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          walk(child, `${path}.${key}`);
        }
      }
    };
    walk(json, "$");
    // Only the four SCI parts form a list.
    expect(arrays).toEqual(["$.parts"]);
    expect(JSON.stringify(json)).not.toContain('gpuSeconds":');
  });
});
