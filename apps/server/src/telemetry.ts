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
// prompt, the model's reply) onto its spans as genkit:input, genkit:output
// and genkit:init. Genkit has no switch for it, so they're dropped before
// export, like the user ids and emails the mcp.request span leaves out.
const PAYLOAD_ATTRIBUTE = /^genkit:(?:input|output|init)$/u;

export class RedactingSpanProcessor implements SpanProcessor {
  readonly #inner: SpanProcessor;

  constructor(inner: SpanProcessor) {
    this.#inner = inner;
  }

  async forceFlush(): Promise<void> {
    await this.#inner.forceFlush();
  }

  onEnd(span: ReadableSpan): void {
    const attributes = Object.fromEntries(
      Object.entries(span.attributes).filter(
        ([key]) => !PAYLOAD_ATTRIBUTE.test(key)
      )
    );
    // The same span with only `attributes` swapped; everything else reads
    // through to it.
    this.#inner.onEnd(
      new Proxy(span, {
        get: (target, property): unknown =>
          property === "attributes"
            ? attributes
            : Reflect.get(target, property, target),
      })
    );
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
      new RedactingSpanProcessor(
        new BatchSpanProcessor(new OTLPTraceExporter())
      ),
    ],
  }).register();
};
