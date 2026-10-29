import { z } from "zod";

import { ACTION_DOMAINS, ACTION_TYPES, RISK_CLASSES } from "./autonomy";

// The Inngest events of autopilot triggers, the approval queue, the ads
// optimizer and the feedback loop (openspec foundation-autonomy-approvals).
// Names and payloads live here, in one place, so producers and consumers in
// every package agree. The schemas are zod (Standard Schema): packages/api
// wraps them with Inngest's `eventType(name, { schema })` for typed
// triggers and sends.

export const EVENTS = {
  // The merchant decided, or the policy settled it at enqueue: executors
  // listen for status "approved".
  approvalDecided: "wovain/approval.decided",
  // An action waits for the merchant: notify them (push, email).
  approvalRequested: "wovain/approval.requested",
  // Scan one brand for autopilot triggers (Qloo, Tavily): the cron fans
  // out one per brand, and "Scan now" sends one.
  autopilotScan: "wovain/autopilot.scan",
  // Find the merchant's new-drop suggestions again and keep them
  // (drop-directions): sent when the kept ones are stale or missing.
  directionsRefresh: "wovain/directions.refresh",
  // Draw, place, preview and price every product of a planned drop
  // (design-drops).
  dropBuildRequested: "wovain/drop.build.requested",
  // Run the feedback loop for one merchant (the daily fan-out).
  feedbackLearn: "wovain/feedback.learn",
  // Send one notification to the merchant's devices (push, then email).
  notify: "wovain/notify",
  // Re-score the merchant's ads and propose reallocations.
  optimizerTick: "wovain/optimizer.tick",
  // A performance snapshot was saved (feedback loop input).
  performanceSnapshot: "wovain/performance.snapshot",
  // Something worth a suggestion happened (a trend, a Qloo signal, a
  // schedule, a performance change).
  triggerFired: "wovain/trigger.fired",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const TRIGGER_KINDS = [
  "trend",
  "qloo",
  "performance",
  "schedule",
  "manual",
  "voice",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const NOTIFY_KINDS = [
  "approval",
  "run_done",
  "run_failed",
  "suggestion",
  "order",
  "anomaly",
] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

const actionType = z.enum(ACTION_TYPES as [string, ...string[]]);

export const eventSchemas = {
  [EVENTS.directionsRefresh]: z.object({
    ignoreBrand: z.boolean(),
    round: z.number().int().min(0),
    userId: z.string(),
  }),
  [EVENTS.approvalDecided]: z.object({
    actionType,
    approvalId: z.string(),
    // A user ID, or "policy".
    decidedBy: z.string(),
    domain: z.enum(ACTION_DOMAINS),
    status: z.enum(["approved", "rejected", "denied"]),
    userId: z.string(),
  }),
  [EVENTS.approvalRequested]: z.object({
    actionType,
    approvalId: z.string(),
    domain: z.enum(ACTION_DOMAINS),
    risk: z.enum(RISK_CLASSES),
    userId: z.string(),
  }),
  [EVENTS.autopilotScan]: z.object({
    // cron or the merchant's "Scan now".
    reason: z.enum(["schedule", "manual"]),
    userId: z.string(),
  }),
  [EVENTS.feedbackLearn]: z.object({ userId: z.string() }),
  [EVENTS.notify]: z.object({
    // Deep link actions on the notification, e.g. approve or open.
    actions: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .default([]),
    approvalId: z.string().optional(),
    body: z.string(),
    kind: z.enum(NOTIFY_KINDS),
    runId: z.string().optional(),
    title: z.string(),
    userId: z.string(),
  }),
  [EVENTS.dropBuildRequested]: z.object({
    dropId: z.string(),
    userId: z.string(),
  }),
  [EVENTS.optimizerTick]: z.object({
    // One campaign, or every campaign of the merchant when absent.
    campaignId: z.string().optional(),
    userId: z.string(),
  }),
  [EVENTS.performanceSnapshot]: z.object({
    // The snapshot's day, YYYY-MM-DD.
    date: z.string(),
    snapshotIds: z.array(z.string()),
    source: z.enum(["meta", "fourthwall"]),
    userId: z.string(),
  }),
  [EVENTS.triggerFired]: z.object({
    kind: z.enum(TRIGGER_KINDS),
    // What fired it, e.g. the trend's headline or the Qloo entity.
    payload: z.record(z.string(), z.unknown()).default({}),
    suggestionId: z.string().optional(),
    userId: z.string(),
  }),
} as const satisfies Record<EventName, z.ZodType>;

export type EventData<N extends EventName> = z.input<(typeof eventSchemas)[N]>;

// Any of the events above, as Inngest's `send` takes it.
export type WovainEvent = {
  [N in EventName]: { name: N; data: EventData<N> };
}[EventName];
