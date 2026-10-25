import { createError, EvlogError } from "evlog";
import type { RequestLogger } from "evlog";

// Every call wovain makes to another service goes through `external`, so the
// request's wide event lists each call with its outcome and duration, and a
// failure surfaces as one structured error naming the provider. The
// self-healing flow groups and retries on these error codes.

export type Logger = Pick<RequestLogger, "set">;

export type Provider =
  | "fal"
  | "fourthwall"
  | "meta"
  | "nebius"
  | "qloo"
  | "tavily";

const FIXES: Record<Provider, string> = {
  fal: "Check FAL_KEY and the fal account's balance.",
  fourthwall: "Reconnect Fourthwall, then retry.",
  meta: "Reconnect Meta and check the ad account and Page, then retry.",
  nebius: "Check NEBIUS_API_KEY and NEBIUS_BASE_URL on Nebius Token Factory.",
  qloo: "Check QLOO_API_KEY and QLOO_API_URL.",
  tavily: "Check TAVILY_API_KEY and the Tavily credit balance.",
};

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
      message: `${provider} ${operation} failed`,
      status: 502,
      why,
      ...(error instanceof Error ? { cause: error } : {}),
    });
  }
};

// A key the merchant's deployment hasn't set: the feature can't run at all.
export const notConfigured = (provider: Provider, variable: string) =>
  createError({
    code: `${provider.toUpperCase()}_NOT_CONFIGURED`,
    fix: `Set ${variable} in apps/web/.env.`,
    message: `${provider} isn't configured on this server`,
    status: 503,
    why: `${variable} isn't set.`,
  });
