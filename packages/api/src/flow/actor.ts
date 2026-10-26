import type { BillingAnalytics } from "@wovain/billing/analytics";
import type { Billing } from "@wovain/billing/service";
import type { Core } from "@wovain/core/core";
import type { Logger } from "@wovain/core/log";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import { defineError } from "evlog";

// Who a flow step runs for, and with what.
export interface Actor {
  analytics?: BillingAnalytics | undefined;
  billing: Billing;
  core: Core;
  db: Database;
  log?: Logger | undefined;
  mailer: Mailer;
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
