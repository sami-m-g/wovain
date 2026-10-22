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
  // The model decides: main keyword first, then design element, then style
  // (the brief schema already caps the length).
  "title",
  // The model decides: two short on-brand lines, no garment specs.
  "description",
  // Code decides the count (3 to 5 in stock); the model decides contrast.
  "colors",
  // The model decides: blank, placement and listing match the idea.
  "idea_fit",
]);
export type JudgeRule = z.infer<typeof judgeRuleSchema>;

const judgeCheckSchema = z.object({
  note: z.string().max(200),
  pass: z.boolean(),
  rule: judgeRuleSchema,
});
export type JudgeCheck = z.infer<typeof judgeCheckSchema>;

// What the model sends: the verdict is derived from the checks in code.
export const judgeReplySchema = z.object({
  checks: z.array(judgeCheckSchema).max(12),
  coach: z.string().min(1).max(160),
  fixes: z.array(z.string().max(200)).max(5),
  score: z.int().min(0).max(100),
});
export type JudgeReply = z.infer<typeof judgeReplySchema>;

export const designJudgmentSchema = judgeReplySchema.extend({
  verdict: z.enum(["ready", "revise"]),
});
export type DesignJudgment = z.infer<typeof designJudgmentSchema>;

// Every field is bounded: the brief goes to a paid model. The bounds live
// here, not on designSchema, so stored designs still parse.
const short = z.string().max(120);
export const designBriefSchema = designSchema
  .pick({ coach: true, listing: true })
  .extend({
    artwork: designSchema.shape.artwork.extend({ url: z.url().max(2048) }),
    // What the art shows, in one line, so the judge can weigh color contrast
    // (the model reads text only).
    artworkDescription: z.string().max(300).optional(),
    blank: designSchema.shape.blank.extend({
      badge: short.optional(),
      catalogProductId: short,
      name: short,
    }),
    colors: z
      .array(
        z.object({
          hex: z.string().regex(/^#[0-9a-f]{6}$/iu),
          inStock: z.boolean(),
          name: short,
        })
      )
      .min(1)
      .max(20),
    idea: z.string().min(1).max(500),
    placement: z.object({ area: short, printSize: short, style: short }),
  });
export type DesignBrief = z.infer<typeof designBriefSchema>;

export const judgeResultSchema = z.object({
  configured: z.boolean(),
  judgment: designJudgmentSchema.optional(),
});
