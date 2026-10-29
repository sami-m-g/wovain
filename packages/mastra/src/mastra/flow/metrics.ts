import type { Actor, RunEvent } from "./actor";

// Run KPIs in PostHog (success rate, run time, approval rate, judge scores):
// snake_case events keyed by the merchant, sent from the step that saw them.
// The app adds `environment`; LLM calls report themselves as $ai_generation
// with $ai_trace_id = run_id (@wovain/core/nemotron).

export const track = async (
  actor: Pick<Actor, "analytics" | "userId">,
  event: RunEvent,
  properties: Record<string, unknown>
) => {
  await actor.analytics?.capture({
    distinctId: actor.userId,
    event,
    properties,
  });
};

type ErrorType =
  | "model"
  | "other"
  | "provider_error"
  | "timeout"
  | "validation";

const PROVIDERS = ["fal", "fourthwall", "meta", "nebius", "qloo", "tavily"];
const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;
const TIMEOUT = /timed? ?out|timeout|aborted/iu;

// What kind of failure ended a run, and whose: read from the error's status
// and code (`<PROVIDER>_FAILED`, `NOT_CONFIGURED`…) or its message.
export const classifyFailure = (
  error: unknown
): { errorType: ErrorType; provider: string | undefined } => {
  const fields: { code?: unknown; status?: unknown } =
    typeof error === "object" && error !== null ? error : {};
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = typeof fields.code === "string" ? fields.code : "";
  const status = Number(fields.status);
  const named = PROVIDERS.find(
    (provider) =>
      code.toLowerCase().startsWith(provider) ||
      message.toLowerCase().startsWith(`${provider} `)
  );
  if (TIMEOUT.test(message)) {
    return { errorType: "timeout", provider: named };
  }
  if (status >= CLIENT_ERROR && status < SERVER_ERROR) {
    return { errorType: "validation", provider: named };
  }
  if (named === "nebius") {
    return { errorType: "model", provider: named };
  }
  if (named !== undefined) {
    return { errorType: "provider_error", provider: named };
  }
  return { errorType: "other", provider: undefined };
};
