import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { z } from "zod";

// The checked-in KPI file (.gitlab/duo/kpis.yml): what the scout flow ranks
// improvements against, and where the ops jobs find the web app's logs and
// metrics. scout-collect.ts measures each KPI; this module parses the file,
// scores each measurement against its target and ranks the gaps.

const metricSource = z.object({
  aligner: z.string(),
  filter: z.string(),
  kind: z.literal("metric"),
  reducer: z.string(),
  // Multiplies the value, e.g. 0.001 for microseconds to milliseconds.
  scale: z.number().default(1),
});
const logRatioSource = z.object({
  denominator: z.string(),
  kind: z.literal("log-ratio"),
  numerator: z.string(),
});
const uiSource = z.object({
  kind: z.literal("ui"),
  measure: z.enum(["lcp", "cls", "consoleErrors"]),
  page: z.string().startsWith("/"),
});

const kpiSchema = z.object({
  direction: z.enum(["up", "down"]),
  id: z.string().regex(/^[a-z0-9-]+$/u),
  name: z.string(),
  source: z.discriminatedUnion("kind", [
    metricSource,
    logRatioSource,
    uiSource,
  ]),
  target: z.number(),
  unit: z.string(),
  // How much a miss on this KPI matters, 1 to 5.
  weight: z.int().min(1).max(5),
  why: z.string(),
});
export type Kpi = z.infer<typeof kpiSchema>;

const kpiFileSchema = z.object({
  kpis: z.array(kpiSchema).min(1),
  service: z.object({
    // Cloud Logging filter for the web app's own lines (evlog wide events).
    logs: z.string(),
    // Cloud Monitoring filter for the same service's resource (SCI reads it).
    metrics: z.string(),
  }),
  windowDays: z.int().min(1).max(30),
});

const KPI_FILE = new URL("../../../.gitlab/duo/kpis.yml", import.meta.url);

export const loadKpis = async (file: URL = KPI_FILE) =>
  kpiFileSchema.parse(parse(await readFile(file, "utf-8")));

export interface Scored {
  kpi: Kpi;
  value: number | undefined;
  // How far the value misses the target, as a fraction of the target (0 when
  // it meets it); undefined without data.
  gap: number | undefined;
  score: number;
  approximate: boolean;
}

// A zero target (no console errors) would make any miss infinite; a miss
// counts at most MAX_GAP times the target, or 1 per unit against zero.
const MAX_GAP = 10;

export const gapOf = (kpi: Kpi, value: number) => {
  const scale = kpi.target === 0 ? 1 : Math.abs(kpi.target);
  const miss =
    kpi.direction === "down" ? value - kpi.target : kpi.target - value;
  return Math.min(MAX_GAP, Math.max(0, miss / scale));
};

// Worst first: weighted gap; KPIs without data last.
export const rank = (
  measured: { kpi: Kpi; value: number | undefined; approximate?: boolean }[]
): Scored[] =>
  measured
    .map((m) => {
      const gap = m.value === undefined ? undefined : gapOf(m.kpi, m.value);
      return {
        approximate: m.approximate ?? false,
        gap,
        kpi: m.kpi,
        score: gap === undefined ? -1 : gap * m.kpi.weight,
        value: m.value,
      };
    })
    .toSorted((a, b) => b.score - a.score);

const show = (n: number | undefined, unit: string) => {
  if (n === undefined) {
    return "no data";
  }
  const rounded = Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(3);
  return `${rounded} ${unit}`.trim();
};

export const kpiReport = (scored: Scored[], at: Date, windowDays: number) =>
  [
    `# KPI snapshot, ${at.toISOString().slice(0, 16)}Z`,
    "",
    `Measured over the last ${windowDays} days (UI KPIs: one page load now). Ranked by weighted gap to target; KPI definitions: \`.gitlab/duo/kpis.yml\`.`,
    "",
    "| Rank | KPI | Value | Target | Gap | Weight | Status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...scored.map((s, i) => {
      let status = "meets target";
      if (s.gap === undefined) {
        status = "no data";
      } else if (s.gap > 0) {
        status = "misses target";
      }
      const gap = s.gap === undefined ? "" : `${(s.gap * 100).toFixed(0)}%`;
      const value = `${show(s.value, s.kpi.unit)}${s.approximate ? " (approx.)" : ""}`;
      return `| ${i + 1} | \`${s.kpi.id}\` ${s.kpi.name} | ${value} | ${s.kpi.direction === "down" ? "<=" : ">="} ${show(s.kpi.target, s.kpi.unit)} | ${gap} | ${s.kpi.weight} | ${status} |`;
    }),
  ].join("\n");
