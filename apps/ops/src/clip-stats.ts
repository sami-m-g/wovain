import { z } from "zod";

import type { ClipSample } from "./records.ts";

// The GPU seconds fal reported for merchants' clips, reduced to one
// aggregate. weekly.ts (the only job that reads merchants' records) writes it
// as the fal-clips.json artifact; the sci job reads only that, never
// Firestore, and no per-merchant or per-clip value leaves the weekly job.

const CLIP_WINDOW_DAYS = 30;

export const clipStatsSchema = z.strictObject({
  at: z.iso.datetime(),
  count: z.int().nonnegative(),
  medianGpuSeconds: z.number().nonnegative(),
  p90GpuSeconds: z.number().nonnegative(),
  windowDays: z.int().positive(),
});
export type ClipStats = z.infer<typeof clipStatsSchema>;

// Nearest-rank percentile of sorted values.
const percentile = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;

// Clips measured in the last CLIP_WINDOW_DAYS; undefined when there are none.
export const clipStats = (
  samples: ClipSample[],
  now: Date
): ClipStats | undefined => {
  const since = now.getTime() - CLIP_WINDOW_DAYS * 86_400_000;
  const sorted = samples
    .flatMap((sample) =>
      Date.parse(sample.at) >= since ? [sample.gpuSeconds] : []
    )
    .toSorted((a, b) => a - b);
  return sorted.length === 0
    ? undefined
    : {
        at: now.toISOString(),
        count: sorted.length,
        medianGpuSeconds: percentile(sorted, 50),
        p90GpuSeconds: percentile(sorted, 90),
        windowDays: CLIP_WINDOW_DAYS,
      };
};
