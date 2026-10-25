import type { Core } from "@wovain/core/core";
import type { Logger } from "@wovain/core/log";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import { createError } from "evlog";

// Who a flow step runs for, and with what.
export interface Actor {
  core: Core;
  db: Database;
  log?: Logger | undefined;
  mailer: Mailer;
  userId: string;
}

export const notFound = (what: string, id: string) =>
  createError({
    code: "NOT_FOUND",
    message: `No ${what} ${id}`,
    status: 404,
    why: `This merchant has no ${what} with that ID.`,
  });

// A step asked for before the one it depends on.
export const notReady = (message: string, fix: string) =>
  createError({ code: "PRECONDITION_FAILED", fix, message, status: 412 });
