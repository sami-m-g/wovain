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
// prompt, the model's reply) onto its spans, and its error message and stack
// into the span's status and exception events. Genkit has no switch for it,
// so a Genkit span exports only the attributes below, its exception events
// without their text, and its status code without the message, like the user
// ids and emails the mcp.request span leaves out.
const GENKIT_ATTRIBUTES = new Set([
  "genkit:isFailureSource",
  "genkit:isRoot",
  "genkit:metadata:subtype",
  "genkit:name",
  "genkit:path",
  "genkit:state",
  "genkit:type",
]);

const isGenkitSpan = (span: ReadableSpan) =>
  "genkit:name" in span.attributes || "genkit:type" in span.attributes;

const redacted = (span: ReadableSpan): Partial<ReadableSpan> => ({
  attributes: Object.fromEntries(
    Object.entries(span.attributes).filter(([key]) =>
      GENKIT_ATTRIBUTES.has(key)
    )
  ),
  events: span.events.map(({ name, time }) => ({ name, time })),
  status: { code: span.status.code },
});

export class RedactingSpanProcessor implements SpanProcessor {
  readonly #inner: SpanProcessor;

  constructor(inner: SpanProcessor) {
    this.#inner = inner;
  }

  async forceFlush(): Promise<void> {
    await this.#inner.forceFlush();
  }

  onEnd(span: ReadableSpan): void {
    if (!isGenkitSpan(span)) {
      this.#inner.onEnd(span);
      return;
    }
    // The same span with attributes, events and status swapped; everything
    // else reads through to it.
    const swapped = redacted(span);
    this.#inner.onEnd(
      new Proxy(span, {
        get: (target, property): unknown =>
          Object.hasOwn(swapped, property)
            ? Reflect.get(swapped, property)
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
