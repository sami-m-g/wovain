import type { Session } from "@wovain/auth";
import type { Core } from "@wovain/core/core";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import type { EvlogOrpcContext } from "evlog/orpc";

// The seller funnel's server-side steps, as PostHog event names. The
// browser adds landing_cta_clicked and sign_up (apps/web).
export type FunnelEvent =
  | "campaign_created"
  | "connect_provider"
  | "design_approved"
  | "product_published"
  | "run_started";

// `log` is the request logger when the caller runs inside an evlog-instrumented request
export interface Context extends Partial<EvlogOrpcContext> {
  // Product analytics (PostHog in apps/web), keyed by user id; absent when
  // the app has no PostHog key.
  analytics?:
    | {
        capture: (event: {
          distinctId: string;
          event: FunnelEvent;
          properties?: Record<string, unknown>;
        }) => void;
      }
    | undefined;
  core: Core;
  db: Database;
  mailer: Mailer;
  // The merchant behind an MCP access token (ChatGPT), which has no session.
  mcpUserId?: string;
  session: Session | null;
}
