import { z } from "zod";

import { videoModelIds } from "./video-models.ts";

// Every value the PRD names is a setting. Defaults come from spec.md > Settings.

export const trendsSettings = z.object({
  ideas: z.int().min(1).max(10).default(5),
  pickMax: z.int().min(1).default(3),
  pickMin: z.int().min(1).default(2),
});

export const pricingSettings = z.object({
  minMarginPct: z.number().min(0).max(95).default(30),
  minProfit: z.number().min(0).default(10),
  roundToCleanPrice: z.boolean().default(true),
});

export const economicsSettings = z.object({
  breakevenBasis: z
    .enum(["priciest-size", "size-weighted"])
    .default("priciest-size"),
  cardFeeFixed: z.number().min(0).default(0.3),
  cardFeePct: z.number().min(0).default(2.9),
  refundReservePct: z.number().min(0).default(2),
  salesTaxPct: z.number().min(0).default(7),
  shipping: z.number().min(0).default(5),
});

export const campaignSettings = z.object({
  // Upper bounds stop a typo from launching a runaway budget.
  dailyBudgetPerProduct: z.number().min(1).max(500).default(15),
});

export const rulesSettings = z.object({
  alertAboveBreakeven: z.boolean().default(true),
  killCheckMinutes: z.int().min(30).default(30),
  killDesignMultiple: z.number().min(1).default(4),
  killExpensiveMinSales: z.int().min(1).default(5),
  killExpensiveMultiple: z.number().min(1).default(1.5),
  killNoSalesMultiple: z.number().min(1).default(3),
  scaleCapMultiple: z.number().min(1).max(5).default(2),
  scaleEveryHours: z.int().min(24).default(48),
  scaleMinSales: z.int().min(1).default(10),
  scaleStepPct: z.number().min(1).default(20),
  scaleUnderMultiple: z.number().min(0).max(1).default(0.8),
  tagUtmContent: z.boolean().default(true),
});

export const videoSettings = z.object({
  clipsPerProduct: z.int().min(1).max(4).default(2),
  elements: z.boolean().default(true),
  model: z.enum(videoModelIds).default("h3-max-reference"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  seconds: z.int().min(5).max(15).default(15),
});

export const audioSettings = z.object({
  prompt: z.string().min(1).default("upbeat background music, no vocals"),
  source: z.enum(["mmaudio", "kling-native", "off"]).default("mmaudio"),
});

export const overlaySettings = z.object({
  brandSeconds: z.int().min(0).max(15).default(3),
  captions: z.boolean().default(true),
});

export const metaSettings = z.object({
  aiDisclosure: z.boolean().default(true),
  graphApiVersion: z
    .string()
    .regex(/^v\d+\.\d+$/u)
    .default("v26.0"),
});

export const settingsSchema = z.object({
  audio: audioSettings.prefault({}),
  campaign: campaignSettings.prefault({}),
  economics: economicsSettings.prefault({}),
  meta: metaSettings.prefault({}),
  overlay: overlaySettings.prefault({}),
  pricing: pricingSettings.prefault({}),
  rules: rulesSettings.prefault({}),
  trends: trendsSettings.prefault({}),
  video: videoSettings.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});

// A partial update: any group, any subset of its fields.
export const settingsPatchSchema = z.object({
  audio: audioSettings.partial().optional(),
  campaign: campaignSettings.partial().optional(),
  economics: economicsSettings.partial().optional(),
  meta: metaSettings.partial().optional(),
  overlay: overlaySettings.partial().optional(),
  pricing: pricingSettings.partial().optional(),
  rules: rulesSettings.partial().optional(),
  trends: trendsSettings.partial().optional(),
  video: videoSettings.partial().optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const applySettingsPatch = (
  current: Settings,
  patch: SettingsPatch
): Settings => {
  const merged: Record<string, unknown> = {};
  for (const group of settingsSchema.keyof().options) {
    merged[group] = { ...current[group], ...patch[group] };
  }
  return settingsSchema.parse(merged);
};
