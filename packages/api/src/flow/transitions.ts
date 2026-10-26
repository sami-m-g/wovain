import { ORPCError } from "@orpc/server";
import { z } from "zod";

// The state machines' guarded moves fail with these typed oRPC errors.
// Procedures declare them (`.errors(transitionErrors)`), so clients read
// `error.code` and `error.data` through `isDefinedError` instead of parsing
// messages.

const CONFLICT = 409;

export const transitionErrors = {
  // approve or reject on a design someone (or autopilot) already decided.
  DESIGN_ALREADY_DECIDED: {
    data: z.object({
      designId: z.string(),
      status: z.enum(["approved", "rejected"]),
    }),
    message: "This design was already decided",
    status: CONFLICT,
  },
  // A decision arrived while the run was still saving its approval gate.
  RUN_NOT_WAITING: {
    data: z.object({ runId: z.string() }),
    message: "The run isn't waiting for a decision yet; try again",
    status: CONFLICT,
  },
} as const;

export const designAlreadyDecided = (data: {
  designId: string;
  status: "approved" | "rejected";
}) =>
  new ORPCError("DESIGN_ALREADY_DECIDED", {
    data,
    message: transitionErrors.DESIGN_ALREADY_DECIDED.message,
    status: CONFLICT,
  });

export const runNotWaiting = (runId: string, cause: unknown) =>
  new ORPCError("RUN_NOT_WAITING", {
    cause,
    data: { runId },
    message: transitionErrors.RUN_NOT_WAITING.message,
    status: CONFLICT,
  });
