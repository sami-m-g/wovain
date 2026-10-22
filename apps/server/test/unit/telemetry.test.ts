import { trace } from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { genkit } from "genkit";
import { mockModel } from "genkit/testing";
import { disableGenkitOTelInitialization } from "genkit/tracing";
import { afterAll, expect, test } from "vitest";

import { createDesignJudge } from "../../src/lib/design-judge.ts";
import { GenkitSpanFilter } from "../../src/telemetry.ts";
import { demoBrief, passingReply } from "../helpers.ts";

const exporter = new InMemorySpanExporter();
// Everything, to show Genkit did trace the call.
const unfiltered = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [
    new GenkitSpanFilter(new SimpleSpanProcessor(exporter)),
    new SimpleSpanProcessor(unfiltered),
  ],
});
provider.register();
disableGenkitOTelInitialization();

afterAll(async () => {
  await provider.shutdown();
});

test("Genkit's spans are dropped and other spans are kept", async () => {
  const ai = genkit({});
  mockModel(ai, { respond: { text: JSON.stringify(passingReply) } });
  await createDesignJudge(ai, "mockModel")(demoBrief);
  trace.getTracer("wovain").startActiveSpan("mcp.request", (span) => {
    span.end();
  });
  expect(
    unfiltered
      .getFinishedSpans()
      .some((span) => span.instrumentationScope.name === "genkit-tracer")
  ).toBe(true);
  const spans = exporter.getFinishedSpans();
  expect(spans.map((span) => span.name)).toStrictEqual(["mcp.request"]);
});
