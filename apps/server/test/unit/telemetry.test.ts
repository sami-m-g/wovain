import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";
import { genkit } from "genkit";
import { mockModel } from "genkit/testing";
import { disableGenkitOTelInitialization } from "genkit/tracing";
import { afterAll, beforeEach, expect, test } from "vitest";

import { createDesignJudge } from "../../src/lib/design-judge.ts";
import { RedactingSpanProcessor } from "../../src/telemetry.ts";
import { demoBrief, passingReply } from "../helpers.ts";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [
    new RedactingSpanProcessor(new SimpleSpanProcessor(exporter)),
  ],
});
provider.register();
disableGenkitOTelInitialization();

beforeEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
});

const isGenkit = (span: ReadableSpan) => "genkit:name" in span.attributes;

// Everything a span carries that could hold text.
const exportedText = (spans: ReadableSpan[]) =>
  JSON.stringify(
    spans.map(({ attributes, events, status }) => ({
      attributes,
      events,
      status,
    }))
  );

test("Genkit spans reach the exporter without the brief or the reply", async () => {
  const ai = genkit({});
  mockModel(ai, { respond: { text: JSON.stringify(passingReply) } });
  await createDesignJudge(ai, "mockModel")(demoBrief);
  const spans = exporter.getFinishedSpans();
  const genkitSpans = spans.filter(isGenkit);
  expect(genkitSpans.length).toBeGreaterThan(0);
  const text = exportedText(spans);
  expect(text).not.toContain("Japanese Cat Sunset");
  expect(text).not.toContain(passingReply.coach);
  for (const span of genkitSpans) {
    expect(span.attributes).not.toHaveProperty("genkit:input");
    expect(span.attributes).not.toHaveProperty("genkit:output");
    // The rest of the span still reads through.
    expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/u);
  }
});

test("a failed Genkit span keeps its error code but not the error text", async () => {
  const ai = genkit({});
  mockModel(ai, {
    respond: [new Error("upstream echoed: Japanese Cat Sunset Tee")],
  });
  await expect(createDesignJudge(ai, "mockModel")(demoBrief)).rejects.toThrow();
  const failed = exporter
    .getFinishedSpans()
    .filter(
      (span) => isGenkit(span) && span.status.code === SpanStatusCode.ERROR
    );
  expect(failed.length).toBeGreaterThan(0);
  expect(failed.some((span) => span.events.length > 0)).toBe(true);
  expect(exportedText(failed)).not.toContain("Japanese Cat Sunset");
  for (const span of failed) {
    expect(span.status.message).toBeUndefined();
    for (const event of span.events) {
      expect(event.attributes).toBeUndefined();
    }
  }
});

test("spans that aren't Genkit's pass through untouched", () => {
  trace.getTracer("test").startActiveSpan("mcp.request", (span) => {
    span.setAttribute("mcp.tool", "judge_design");
    span.setStatus({ code: SpanStatusCode.ERROR, message: "kept" });
    span.end();
  });
  const [span] = exporter.getFinishedSpans();
  expect(span?.attributes).toStrictEqual({ "mcp.tool": "judge_design" });
  expect(span?.status.message).toBe("kept");
});
