import { z } from "zod";

import { designSchema } from "./design.ts";

// The design judge (judge_design): a second model checks a design brief
// against the design playbook's print and listing rules before the widget
// shows it. Nothing here is stored.

export const judgeRuleSchema = z.enum([
  // Code decides: the artwork is at least the required width.
  "print_size",
  // Code decides: the artwork has a transparent background.
  "transparency",
  // Code decides the length (≤ 120); the model decides the order: main
  // keyword, design element, style.
  "title",
  // The model decides: two short on-brand lines, no garment specs.
  "description",
  // Code decides the count (3 to 5 in stock); the model decides contrast.
  "colors",
  // The model decides: blank, placement and listing match the idea.
  "idea_fit",
]);
export type JudgeRule = z.infer<typeof judgeRuleSchema>;

export const judgeCheckSchema = z.object({
  note: z.string().max(200),
  pass: z.boolean(),
  rule: judgeRuleSchema,
});
export type JudgeCheck = z.infer<typeof judgeCheckSchema>;

export const designJudgmentSchema = z.object({
  checks: z.array(judgeCheckSchema),
  coach: z.string().min(1).max(160),
  fixes: z.array(z.string().max(200)).max(5),
  score: z.int().min(0).max(100),
  verdict: z.enum(["ready", "revise"]),
});
export type DesignJudgment = z.infer<typeof designJudgmentSchema>;

export const designBriefSchema = designSchema
  .pick({
    artwork: true,
    blank: true,
    coach: true,
    colors: true,
    idea: true,
    listing: true,
    placement: true,
  })
  .extend({
    // What the art shows, in one line, so the judge can weigh color contrast
    // (the model reads text only).
    artworkDescription: z.string().max(300).optional(),
  });
export type DesignBrief = z.infer<typeof designBriefSchema>;

export const judgeResultSchema = z.object({
  configured: z.boolean(),
  judgment: designJudgmentSchema.optional(),
});
