import type { BillingEvent } from "@wovain/billing/analytics";
import type { Billing } from "@wovain/billing/service";
import type { Core } from "@wovain/core/core";
import type { WovainEvent } from "@wovain/core/events";
import type { FlagPlan } from "@wovain/core/flag-registry";
import type { Logger } from "@wovain/core/log";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import { defineError } from "evlog";

// The seller funnel's server-side steps, as PostHog event names: sign_up
// comes from Better Auth when it creates a user (packages/auth), the rest from
// procedures. The browser adds landing_cta_clicked (apps/web).
// Billing adds its revenue and usage events (packages/billing/src/analytics.ts).
export type FunnelEvent =
  | BillingEvent
  | "campaign_created"
  | "campaign_delivering"
  | "campaign_started"
  | "connection_completed"
  | "connect_provider"
  | "design_approved"
  | "first_drop_started"
  | "fourthwall_shop_ready"
  | "meta_page_ready"
  | "meta_payment_ready"
  | "payouts_ready"
  | "pixel_ready"
  | "first_profitable_product"
  | "first_sale"
  | "product_published"
  | "products_published"
  | "run_started"
  | "sign_up"
  | "signed_up";

// What runs report as they go (./metrics): the agent's quality and speed.
export type RunEvent =
  | "agent_score"
  | "design_generated"
  | "design_rejected"
  | "run_completed"
  | "run_failed";

// Voice commands (./voice): the intent kind and the outcome, never the words.
export type VoiceEvent = "voice_command_confirmed" | "voice_command_proposed";

export interface Analytics {
  // Resolves once PostHog has the event, and never rejects: a caller awaits
  // it before answering, because Cloud Run throttles the CPU of work left
  // after the response.
  capture: (event: {
    distinctId: string;
    event: FunnelEvent | RunEvent | VoiceEvent;
    properties?: Record<string, unknown>;
    // When it happened, if not now.
    timestamp?: Date;
  }) => Promise<void>;
  // Sets person properties (`$set`), such as the merchant's plan.
  identify?:
    | ((person: {
        distinctId: string;
        properties: Record<string, unknown>;
      }) => void)
    | undefined;
}

// The merchant's answer at a run's approval gate.
export interface RunDecision {
  approve: boolean;
  reason?: string | undefined;
}

export interface RunInput {
  autopilot: boolean;
  countries: string[];
  dailyBudget: number;
  seed: string;
}

// Where runs execute: a durable workflow (../workflows), never the request.
export interface RunEngine {
  // Queues a saved run and returns at once.
  start: (run: {
    input: RunInput;
    runId: string;
    userId: string;
  }) => Promise<void>;
  // Continues a run waiting at its ideas gate: it draws a design for each
  // of these ideas, and for no other.
  approveIdeas: (runId: string, ideaIds: string[]) => Promise<void>;
  // Continues a run waiting at its approval gate.
  resume: (runId: string, decision: RunDecision) => Promise<void>;
}

// Sends wovain's Inngest events (@wovain/core/events).
export interface EventSender {
  send: (event: WovainEvent) => Promise<unknown>;
}

// Who a flow step runs for, and with what. `runs` is absent inside a run's
// own steps, which never start or resume runs.
export interface Actor {
  analytics?: Analytics | undefined;
  billing: Billing;
  core: Core;
  db: Database;
  // Inngest events (approvals, triggers, the optimizer); absent in tests.
  events?: EventSender | undefined;
  log?: Logger | undefined;
  mailer: Mailer;
  // The merchant's plan, for flag targeting and plan-gated flags. Billing (MR
  // !116) sets it from the subscription; unset counts as free, the only plan
  // sold at launch.
  plan?: FlagPlan | undefined;
  runs?: RunEngine | undefined;
  userId: string;
}

const missing = (what: string) =>
  defineError("NOT_FOUND", {
    message: ({ id }: { id: string }) => `No ${what} ${id}`,
    status: 404,
    why: `This merchant has no ${what} with that ID.`,
  });

export const notFound = {
  design: missing("design"),
  idea: missing("idea"),
  product: missing("product"),
  run: missing("run"),
};

// A step asked for before the one it depends on; each call names which.
export const notReady = defineError("PRECONDITION_FAILED", {
  message: "A step this one depends on isn't done",
  status: 412,
});
