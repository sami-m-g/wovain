import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";

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
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  }).register();
};
