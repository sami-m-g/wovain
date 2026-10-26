import { trace } from "@opentelemetry/api";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeSDK } from "@opentelemetry/sdk-node";

// OpenTelemetry for GitLab Observability (docs/flows.md, "GitLab
// Observability"). The SDK reads the standard OTEL_* variables: with
// OTEL_EXPORTER_OTLP_ENDPOINT set (Cloud Run gets the group's OTLP endpoint
// from infra/index.ts), Next.js's own request spans, outgoing fetch spans
// and Node runtime metrics go there over OTLP/HTTP, with
// OTEL_RESOURCE_ATTRIBUTES naming the GitLab project and environment.
// Without it nothing starts, so local runs, builds and tests export nothing.
export const startOtel = () => {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (endpoint === undefined || endpoint === "") {
    return;
  }
  new NodeSDK({
    instrumentations: [
      new RuntimeNodeInstrumentation(),
      new UndiciInstrumentation(),
    ],
    serviceName: "wovain-web",
  }).start();
};

// The active span's W3C trace and span IDs, which tie a log line or a
// PostHog exception to its trace in GitLab Observability; undefined when
// no SDK runs or no span is active.
export const activeTraceIds = () => {
  const context = trace.getActiveSpan()?.spanContext();
  if (context === undefined || !trace.isSpanContextValid(context)) {
    return;
  }
  return { spanId: context.spanId, traceId: context.traceId };
};
