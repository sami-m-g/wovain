import { z } from "zod";

// Autopilot (prd.md > Autopilot): one command runs the journey with no
// approvals. The merchant opts in once on wovain's confirm page; after that,
// Nemotron decides at each approval point and code holds the limits below.
// Products stay hidden and the campaign stays paused until the merchant
// confirms "go live" on the launch page.

// What the merchant agrees to on the opt-in page; the model can't change any.
// The stored consent pins `version`; changing a term means a new version and
// a new opt-in.
export const AUTOPILOT_TERMS = {
  // Ads made with fal carry Meta's AI label.
  aiLabel: true,
  campaign: "paused",
  // Judge rounds a design may fail before autopilot drops it.
  maxRevisions: 2,
  // At most this much of the merchant's fal credit per run (art, images,
  // videos, audio), counted at list prices before each job is sent.
  maxSpendUsd: 5,
  products: "hidden",
  version: 1,
} as const;

export const runIdSchema = z.string().regex(/^[\w-]{1,64}$/u);

export const autopilotStartSchema = z.object({
  // The product idea or niche ("a tee for cat lovers"); research picks the
  // theme when it's broad.
  idea: z.string().trim().min(3).max(200),
  // Same key, same run: a retried start never makes a second run.
  runKey: runIdSchema.optional(),
  // UGC clips cost most of a run; off unless asked for.
  videos: z.boolean().default(false),
});
export type AutopilotStart = z.infer<typeof autopilotStartSchema>;

export const decisionPointSchema = z.enum(["idea", "design", "ads"]);
export type DecisionPoint = z.infer<typeof decisionPointSchema>;

// One stored decision: who decided what, why, and which code limits applied.
export const runDecisionSchema = z.object({
  at: z.iso.datetime(),
  choice: z.string().max(80),
  // The code limits that checked or overrode the model's choice.
  limits: z.array(z.string().max(200)).max(10).default([]),
  point: decisionPointSchema,
  reason: z.string().max(600),
  subject: z.string().max(120),
});
export type RunDecision = z.infer<typeof runDecisionSchema>;

export const runStatusSchema = z.enum(["running", "stopped", "done"]);

export const MAX_DECISIONS = 40;

// One art job generate_art sent in the run: the piece's declared words, and
// the image fal made once wovain has read the job's result.
export const runArtSchema = z.object({
  endpointId: z.string().max(200),
  requestId: z.string().max(200),
  text: z.array(z.string().max(80)).max(4),
  url: z.url().optional(),
});
export type RunArt = z.infer<typeof runArtSchema>;

export const autopilotRunSchema = z.object({
  // Every art job of the run. A design is approved only if each of its
  // artworks is one of these images; its declared words are screened and
  // checked against what OCR reads on the image.
  art: z.array(runArtSchema).max(40).default([]),
  createdAt: z.iso.datetime(),
  decisions: z.array(runDecisionSchema).max(MAX_DECISIONS).default([]),
  // Every design the run decided, with the judge rounds each has used; each
  // counts toward the run's cap on designs.
  designs: z.record(z.string(), z.int().min(0)).default({}),
  // Designs the run dropped: never decided again.
  dropped: z.array(z.string()).max(20).default([]),
  id: runIdSchema,
  idea: z.string().max(200),
  spentUsd: z.number().min(0).default(0),
  status: runStatusSchema,
  stopReason: z.string().max(300).optional(),
  videos: z.boolean(),
});
export type AutopilotRun = z.infer<typeof autopilotRunSchema>;

// Written only by wovain's confirm page (the merchant's own Confirm press);
// autopilot_stop with turnOff revokes it.
export const autopilotConsentSchema = z.object({
  at: z.iso.datetime(),
  revokedAt: z.iso.datetime().optional(),
  version: z.int().min(1),
});
export type AutopilotConsent = z.infer<typeof autopilotConsentSchema>;
