// Kept apart from competition.ts: the idea card reads it in the browser.
// How crowded the theme is, from the near-identical listings among the
// SEARCH_MAX results: high is over the threshold autopilot skips.
const SATURATION_LEVELS = ["low", "medium", "high"] as const;
export type SaturationLevel = (typeof SATURATION_LEVELS)[number];
const MEDIUM_AT = 4;
export const SATURATED_AT = 8;

export const saturationOf = (count: number): SaturationLevel => {
  if (count >= SATURATED_AT) {
    return "high";
  }
  return count >= MEDIUM_AT ? "medium" : "low";
};
