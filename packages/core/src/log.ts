import { createError, defineError, EvlogError } from "evlog";
import type { RequestLogger } from "evlog";

// Every call wovain makes to another service goes through `external`, so the
// request's wide event lists each call with its outcome and duration, and a
// failure surfaces as one structured error naming the provider, grouped in
// error tracking by its code.

export type Logger = Pick<RequestLogger, "set"> &
  Partial<Pick<RequestLogger, "error">>;

export type Provider =
  | "fal"
  | "fourthwall"
  | "meta"
  | "nebius"
  | "qloo"
  | "tavily";

const FIXES: Record<Provider, string> = {
  fal: "Check the fal connection in Connections and your fal balance, then retry.",
  fourthwall: "Reconnect Fourthwall, then retry.",
  meta: "Reconnect Meta and check the ad account and Page, then retry.",
  nebius: "Check NEBIUS_API_KEY and NEBIUS_BASE_URL on Nebius Token Factory.",
  qloo: "Check QLOO_API_KEY and QLOO_API_URL.",
  tavily: "Check TAVILY_API_KEY and the Tavily credit balance.",
};

const MAX_REASON = 300;

// A provider out of credits on wovain's plan (Tavily's SDK drops its 432
// status and keeps only these words). No retry passes until the plan is
// topped up, so it is a 4xx: the run fails at once with the reason instead
// of spending minutes on retries.
const OUT_OF_CREDITS = /usage limit|exceeds your plan|pay-as-you-go limit/iu;
const PAYMENT_REQUIRED = 402;
const BAD_GATEWAY = 502;

// The provider's own words, led by its HTTP status when the error has one
// (the MCP SDK's SdkHttpError, a fetch failure): "401 invalid_token …".
const reasonOf = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined;
  const reason =
    status === undefined || message.includes(String(status))
      ? message
      : `${status} ${message}`;
  return reason.slice(0, MAX_REASON);
};

export interface ExternalCall {
  operation: string;
  provider: Provider;
}

export const external = async <T>(
  log: Logger | undefined,
  { operation, provider }: ExternalCall,
  run: () => Promise<T>
): Promise<T> => {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const result = await run();
    log?.set({ external: [{ ms: ms(), ok: true, operation, provider }] });
    return result;
  } catch (error) {
    const why = reasonOf(error);
    log?.set({
      external: [{ error: why, ms: ms(), ok: false, operation, provider }],
    });
    if (EvlogError.isEvlogError(error)) {
      throw error;
    }
    throw createError({
      code: `${provider.toUpperCase()}_FAILED`,
      fix: FIXES[provider],
      internal: { operation, provider },
      // The reason rides in the message too: a run keeps only the message.
      message: `${provider} ${operation} failed: ${why}`,
      status: OUT_OF_CREDITS.test(why) ? PAYMENT_REQUIRED : BAD_GATEWAY,
      why,
      ...(error instanceof Error ? { cause: error } : {}),
    });
  }
};

// A key the merchant's deployment hasn't set: the feature can't run at all.
const unconfigured = (provider: Provider, variable: string) =>
  defineError(`${provider.toUpperCase()}_NOT_CONFIGURED`, {
    fix: `Set ${variable} in apps/web/.env.`,
    message: `${provider} isn't configured on this server`,
    status: 503,
    why: `${variable} isn't set.`,
  });

// Qloo matched nothing in the brief, so there is no audience and no theme
// to research: every idea is a Qloo tag, and none is made up instead. A
// 4xx, so the run fails at once rather than retrying. The merchant's fix is
// a brief that names something Qloo knows.
export const QLOO_NO_MATCH_MESSAGE =
  "Qloo found no audience for this brief; try naming a band, film, brand or place";
export const qlooNoMatch = defineError("QLOO_NO_MATCH", {
  fix: "Name a band, film, brand or place your fans love, for example Studio Ghibli, Tame Impala or Patagonia.",
  message: QLOO_NO_MATCH_MESSAGE,
  status: 422,
  why: "Qloo's taste graph matched no entity, or no taste tag, for the brief.",
});

export const notConfigured = {
  // wovain's own fal key, for voice transcription (./voice).
  fal: unconfigured("fal", "FAL_KEY"),
  meta: unconfigured("meta", "META_APP_ID and META_APP_SECRET"),
  nebius: unconfigured("nebius", "NEBIUS_API_KEY"),
  qloo: unconfigured("qloo", "QLOO_API_KEY"),
  tavily: unconfigured("tavily", "TAVILY_API_KEY"),
};
