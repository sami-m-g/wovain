import { TraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import type {
  ObservabilityExporter,
  ScoreEvent,
} from "@mastra/core/observability";
import {
  MastraStorageExporter,
  Observability,
  SamplingStrategyType,
} from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";

import type { Analytics } from "../flow/actor";

// Mastra AI tracing for runs, agents, scorers and guardrails: every span is
// kept in Mastra's store and goes to Google Cloud Trace over OpenTelemetry
// (on Cloud Run, through the service account's default credentials), next
// to PostHog, which keeps the
// LLM generations ($ai_generation, sent by the model wrapper in
// @wovain/core/agents) and gets each live score as agent_score.

const UUID_HEX =
  /^(?<a>[\da-f]{8})(?<b>[\da-f]{4})(?<c>[\da-f]{4})(?<d>[\da-f]{4})(?<e>[\da-f]{12})$/u;

// A run's trace ID is its UUID without dashes (@wovain/core/nemotron).
export const runIdOf = (traceId: string | undefined) =>
  traceId?.replace(UUID_HEX, "$<a>-$<b>-$<c>-$<d>-$<e>");

const textOf = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const idle = async () => {
  await Promise.resolve();
};

// Forwards each score Mastra records to PostHog, as the KPI dashboards
// read it: agent_score with run_id, scorer, score (0 to 1) and target.
export const scoresToPostHog = (
  analytics: Analytics
): ObservabilityExporter => ({
  exportTracingEvent: idle,
  flush: idle,
  name: "wovain-scores-posthog",
  onScoreEvent: async ({ score }: ScoreEvent) => {
    const metadata = score.metadata ?? {};
    await analytics.capture({
      distinctId: textOf(metadata["userId"]) ?? "wovain-scorer",
      event: "agent_score",
      properties: {
        reason: score.reason?.slice(0, 500),
        run_id: textOf(metadata["runId"]) ?? runIdOf(score.traceId) ?? null,
        score: score.score,
        scorer: score.scorerId,
        source: score.scoreSource ?? "live",
        target: score.targetEntityType ?? "agent",
      },
    });
  },
  shutdown: idle,
});

export const createObservability = ({
  analytics,
  cloudTrace,
}: {
  analytics?: Analytics | undefined;
  // On Google Cloud (K_SERVICE is set on Cloud Run): export to Cloud Trace.
  cloudTrace: boolean;
}) =>
  new Observability({
    configs: {
      default: {
        exporters: [
          // Traces in Mastra's store too: Studio and the score views read them.
          new MastraStorageExporter(),
          ...(cloudTrace
            ? [new OtelExporter({ exporter: new TraceExporter() })]
            : []),
          ...(analytics === undefined ? [] : [scoresToPostHog(analytics)]),
        ],
        sampling: { type: SamplingStrategyType.ALWAYS },
        serviceName: "wovain-web",
      },
    },
  });
