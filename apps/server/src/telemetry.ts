import type { Context } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import type {
  ReadableSpan,
  Span,
  SpanProcessor,
} from "@opentelemetry/sdk-trace-node";

// Genkit writes each action's input and output (the design brief, the
// prompt, the model's reply) and its error text onto its spans, and has no
// switch for it. So its tracer's spans aren't exported at all, like the user
// ids and emails the mcp.request span leaves out.
export class GenkitSpanFilter implements SpanProcessor {
  readonly #inner: SpanProcessor;

  constructor(inner: SpanProcessor) {
    this.#inner = inner;
  }

  async forceFlush(): Promise<void> {
    await this.#inner.forceFlush();
  }

  onEnd(span: ReadableSpan): void {
    // The tracer name in @genkit-ai/core's tracing/instrumentation.
    if (span.instrumentationScope.name !== "genkit-tracer") {
      this.#inner.onEnd(span);
    }
  }

  onStart(span: Span, parentContext: Context): void {
    this.#inner.onStart(span, parentContext);
  }

  async shutdown(): Promise<void> {
    await this.#inner.shutdown();
  }
}

// Traces go to GitLab Observability over OTLP/HTTP when
// OTEL_EXPORTER_OTLP_ENDPOINT (and OTEL_EXPORTER_OTLP_HEADERS for its token)
// are set; the exporter reads both. Without them nothing is registered, so
// tests and local runs need no collector.
export const registerTelemetry = () => {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (endpoint === undefined || endpoint === "") {
    return;
  }
  // App Hosting names the running revision in K_REVISION.
  const version = process.env["K_REVISION"] ?? process.env["CI_COMMIT_SHA"];
  new NodeTracerProvider({
    resource: resourceFromAttributes({
      "deployment.environment.name":
        process.env["K_REVISION"] === undefined ? "development" : "production",
      "gitlab.project.id": 87_296_573,
      "gitlab.project.name": "showcase",
      "service.name": "wovain",
      ...(version === undefined ? {} : { "service.version": version }),
    }),
    spanProcessors: [
      new GenkitSpanFilter(new BatchSpanProcessor(new OTLPTraceExporter())),
    ],
  }).register();
};
