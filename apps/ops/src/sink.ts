import { PostHog } from "posthog-node";

// The ops jobs' way into PostHog Error Tracking, the one place errors are
// watched (docs/flows.md, "One error sink"): platform errors from Cloud
// Logging (platform.ts) and failed synthetic checks (smoke.ts) become
// `$exception` events with the project's public token, next to the app's
// server and browser exceptions. heal and the release guard then read
// PostHog alone.

export interface Exception {
  name: string;
  message: string;
  fingerprint: string;
  // "platform" or "smoke"; the app's own are "server", the browser's none.
  source: "platform" | "smoke";
  environment: "development" | "production";
  site: string;
  method: string;
  path: string;
  status?: number | undefined;
  // Makes a resent event the same event.
  uuid?: string | undefined;
  extra?: Record<string, unknown>;
}

export interface Sink {
  capture: (exception: Exception) => void;
  // Sends what's queued; call it before the job exits.
  flush: () => Promise<void>;
}

export const createSink = (options: { apiKey: string; host: string }): Sink => {
  const client = new PostHog(options.apiKey, { host: options.host });
  return {
    capture: (e) => {
      const error = new Error(e.message);
      error.name = e.name;
      // No stack: the ops job's own frames say nothing about the fault.
      error.stack = `${e.name}: ${e.message}`;
      client.captureException(
        error,
        undefined,
        {
          ...e.extra,
          $exception_fingerprint: `${e.source}:${e.fingerprint}`,
          environment: e.environment,
          error_source: e.source,
          method: e.method,
          path: e.path,
          site: e.site,
          status: e.status,
        },
        e.uuid
      );
    },
    flush: async () => {
      await client.shutdown();
    },
  };
};
