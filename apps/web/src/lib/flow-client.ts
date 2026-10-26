import { ORPCError } from "@orpc/client";
import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@wovain/api/routers/index";

/**
 * Shared types and helpers for the seller flow. Screens call the oRPC
 * procedures through `orpc` (TanStack Query) or `client` from `@/utils/orpc`;
 * types come straight from `AppRouter`, so a backend change surfaces here at
 * compile time.
 */

type Outputs = InferRouterOutputs<AppRouter>;

export type Provider = Outputs["connections"]["list"][number]["provider"];
export type Connection = Outputs["connections"]["list"][number];
export type Run = Outputs["runs"]["list"][number];
export type RunDetail = Outputs["runs"]["get"];
export type Idea = RunDetail["ideas"][number];
export type Design = Outputs["designs"]["get"];
export type Product = Outputs["products"]["create"];
export type Campaign = Outputs["campaigns"]["create"];
export type BillingStatus = Outputs["billing"]["status"];
export type Insights = Outputs["insights"]["overview"];
export type InsightRange = Insights["range"]["key"];

export const PROVIDERS = [
  "fourthwall",
  "meta",
  "fal",
] as const satisfies readonly Provider[];
/**
 * The browser URL that starts connecting a provider; the server redirects to
 * the provider's consent page and back to `returnTo` with `?connected=`.
 */
export const connectUrl = (provider: Provider, returnTo: string) =>
  `/api/connections/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`;

export type FlowProblem =
  | { kind: "not_configured"; service: string; variable?: string }
  | { kind: "not_connected"; service: string }
  | { kind: "limit"; message: string; fix?: string }
  // The step needs more credits than the merchant has left.
  | {
      kind: "credits";
      message: string;
      fix?: string;
      needed?: number;
      available?: number;
    }
  // The step needs a paid plan (autopilot on Free).
  | { kind: "plan"; message: string; fix?: string }
  | { kind: "other"; message: string };

const VARIABLE = /\b(?<name>[A-Z][A-Z0-9_]{2,})\b/u;
const SERVICE_CODE =
  /^(?<service>[A-Z]+)_(?<kind>NOT_CONFIGURED|NOT_CONNECTED)$/u;

const text = (value: unknown) =>
  typeof value === "string" ? { fix: value } : {};
const count = (key: "available" | "needed", value: unknown) =>
  typeof value === "number" ? { [key]: value } : {};

/**
 * The billing refusals, as paywall kinds; the server words the message and
 * the fix in the merchant's language.
 */
const refusal = (
  error: ORPCError<string, unknown>
): FlowProblem | undefined => {
  const data = (error.data ?? {}) as {
    available?: unknown;
    fix?: unknown;
    needed?: unknown;
  };
  switch (String(error.code)) {
    case "OUT_OF_CREDITS": {
      return {
        kind: "credits",
        message: error.message,
        ...text(data.fix),
        ...count("needed", data.needed),
        ...count("available", data.available),
      };
    }
    // A checkout while only Free is on sale: the server words why.
    case "PAID_PLANS_NOT_AVAILABLE": {
      return { kind: "limit", message: error.message, ...text(data.fix) };
    }
    case "PLAN_REQUIRED": {
      return { kind: "plan", message: error.message, ...text(data.fix) };
    }
    case "EMAIL_NOT_VERIFIED": {
      return { kind: "limit", message: error.message, ...text(data.fix) };
    }
    default: {
      return undefined;
    }
  }
};

/** Turns a procedure error into something a step can explain to the seller. */
export const describeProblem = (error: unknown): FlowProblem => {
  if (error instanceof ORPCError) {
    const refused = refusal(error);
    if (refused) {
      return refused;
    }
    const match = SERVICE_CODE.exec(String(error.code));
    if (match?.groups) {
      const service = match.groups.service?.toLowerCase() ?? "";
      if (match.groups.kind === "NOT_CONNECTED") {
        return { kind: "not_connected", service };
      }
      const data = (error.data ?? {}) as { why?: unknown; fix?: unknown };
      const variable = VARIABLE.exec(String(data.why ?? data.fix ?? ""))?.groups
        ?.name;
      return variable
        ? { kind: "not_configured", service, variable }
        : { kind: "not_configured", service };
    }
    return { kind: "other", message: error.message };
  }
  return {
    kind: "other",
    message: error instanceof Error ? error.message : String(error),
  };
};

/** Why a run stopped, in terms a step can explain without server detail. */
export type RunFailure =
  | { reason: "not_connected"; service: Provider }
  | { reason: "no_ideas" }
  | { reason: "rejected" }
  | { reason: "other"; message: string };

const NOT_CONNECTED_CODE =
  /\b(?<service>fal|fourthwall|meta)_not_connected\b/iu;
const NOT_CONNECTED_TEXT =
  /\b(?<service>fal|fourthwall|meta)\b.{0,40}(?:isn't connected|not connected)|connect your (?<named>fal|fourthwall|meta)\b/iu;
const NO_IDEAS = /found no ideas/iu;
const AUTOPILOT_REJECTED = /autopilot rejected/iu;

/**
 * The failed run's stored message, read for its cause. The workflow keeps the
 * error's message (a typed error like FAL_NOT_CONNECTED included), so a
 * missing connection is recognised by its code or its wording.
 */
export const describeRunFailure = (run: {
  error?: string | null;
}): RunFailure => {
  const message = run.error ?? "";
  const found = (
    NOT_CONNECTED_CODE.exec(message) ?? NOT_CONNECTED_TEXT.exec(message)
  )?.groups;
  const service = (found?.service ?? found?.named)?.toLowerCase();
  if (service === "fal" || service === "fourthwall" || service === "meta") {
    return { reason: "not_connected", service };
  }
  if (NO_IDEAS.test(message)) {
    return { reason: "no_ideas" };
  }
  if (AUTOPILOT_REJECTED.test(message)) {
    return { reason: "rejected" };
  }
  return { message, reason: "other" };
};
