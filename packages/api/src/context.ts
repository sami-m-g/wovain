import type { Session } from "@wovain/auth";
import type { Billing } from "@wovain/billing/service";
import type { Core } from "@wovain/core/core";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import type { EvlogOrpcContext } from "evlog/orpc";

import type { Analytics, EventSender, RunEngine } from "./flow/actor";

export type { FunnelEvent } from "./flow/actor";

// `log` is the request logger when the caller runs inside an evlog-instrumented request
export interface Context extends Partial<EvlogOrpcContext> {
  // Product analytics and error tracking (PostHog in apps/web), keyed by
  // user id; absent when the app has no PostHog key.
  analytics?: Analytics | undefined;
  // Polar: checkout, the customer portal and usage reports.
  billing: Billing;
  core: Core;
  db: Database;
  // Sends wovain's Inngest events (approvals, triggers, the optimizer).
  events?: EventSender | undefined;
  mailer: Mailer;
  // The merchant behind an MCP access token (ChatGPT), which has no session.
  mcpUserId?: string;
  // Starts and resumes runs on the durable engine (../workflows/engine).
  runs: RunEngine;
  session: Session | null;
}
