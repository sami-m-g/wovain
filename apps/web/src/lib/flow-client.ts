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

export const PROVIDERS = [
  "fourthwall",
  "meta",
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
  | { kind: "other"; message: string };

const VARIABLE = /\b(?<name>[A-Z][A-Z0-9_]{2,})\b/u;
const SERVICE_CODE =
  /^(?<service>[A-Z]+)_(?<kind>NOT_CONFIGURED|NOT_CONNECTED)$/u;
// The spend guard's refusals; the server words them in the merchant's language.
const LIMITS = new Set(["DAILY_LIMIT", "EMAIL_NOT_VERIFIED", "SPEND_CAP"]);

/** Turns a procedure error into something a step can explain to the seller. */
export const describeProblem = (error: unknown): FlowProblem => {
  if (error instanceof ORPCError) {
    if (LIMITS.has(String(error.code))) {
      const { fix } = (error.data ?? {}) as { fix?: unknown };
      return typeof fix === "string"
        ? { fix, kind: "limit", message: error.message }
        : { kind: "limit", message: error.message };
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
