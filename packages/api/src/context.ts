import type { Session } from "@wovain/auth";
import type { Core } from "@wovain/core/core";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import type { EvlogOrpcContext } from "evlog/orpc";

// The seller funnel's server-side steps, as PostHog event names: sign_up
// comes from Better Auth when it creates a user (packages/auth), the rest from
// procedures. The browser adds landing_cta_clicked (apps/web).
export type FunnelEvent =
  | "campaign_created"
  | "connect_provider"
  | "design_approved"
  | "product_published"
  | "run_started"
  | "sign_up";

// `log` is the request logger when the caller runs inside an evlog-instrumented request
export interface Context extends Partial<EvlogOrpcContext> {
  // Product analytics and error tracking (PostHog in apps/web), keyed by
  // user id; absent when the app has no PostHog key.
  analytics?:
    | {
        capture: (event: {
          distinctId: string;
          event: FunnelEvent;
          properties?: Record<string, unknown>;
        }) => void;
        // An unexpected procedure error, as a `$exception` event. Without a
        // distinct id, the event is anonymous.
        captureException: (
          error: unknown,
          event: {
            distinctId?: string | undefined;
            properties?: Record<string, unknown>;
          }
        ) => void;
      }
    | undefined;
  core: Core;
  db: Database;
  mailer: Mailer;
  // The merchant behind an MCP access token (ChatGPT), which has no session.
  mcpUserId?: string;
  session: Session | null;
}
