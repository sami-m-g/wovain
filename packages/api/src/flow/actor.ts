import type { Core } from "@wovain/core/core";
import type { Logger } from "@wovain/core/log";
import type { Database } from "@wovain/db";
import type { Mailer } from "@wovain/email/mailer";
import { defineError } from "evlog";

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
  // Continues a run waiting at its approval gate.
  resume: (runId: string, decision: RunDecision) => Promise<void>;
}

// Who a flow step runs for, and with what. `runs` is absent inside a run's
// own steps, which never start or resume runs.
export interface Actor {
  core: Core;
  db: Database;
  log?: Logger | undefined;
  mailer: Mailer;
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
