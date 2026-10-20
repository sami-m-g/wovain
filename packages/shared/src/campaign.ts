import { z } from "zod";

// What the campaign card shows (prd.md > Campaign launch). Products, budget and
// rule thresholds come from the store; the skill only reports Meta's state.

export const campaignStatusSchema = z.enum(["ready", "live", "blocked"]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

// Blocker links come from the model, so only Meta's own https pages pass.
export const metaLinkSchema = z.url({
  hostname: /^(?:business|adsmanager|www)\.facebook\.com$/u,
  protocol: /^https$/u,
});

export const blockerSchema = z.object({
  fix: z.string().min(1).max(200),
  issue: z.string().min(1).max(120),
  url: metaLinkSchema.optional(),
});

export const campaignSchema = z.object({
  adsManagerUrl: metaLinkSchema.optional(),
  blockers: z.array(blockerSchema).default([]),
  campaignId: z.string().optional(),
  dailyBudget: z.number().positive(),
  products: z.array(
    z.object({ ads: z.int().min(0), designId: z.string(), title: z.string() })
  ),
  rules: z.array(
    z.object({
      created: z.boolean(),
      detail: z.string(),
      label: z.string(),
    })
  ),
  status: campaignStatusSchema,
});
export type Campaign = z.infer<typeof campaignSchema>;

export const campaignResultSchema = z.object({ campaign: campaignSchema });
