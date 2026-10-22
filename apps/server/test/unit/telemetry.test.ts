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
import { RedactingSpanProcessor } from "../../src/telemetry.ts";
import { demoBrief, passingReply } from "../helpers.ts";

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [
    new RedactingSpanProcessor(new SimpleSpanProcessor(exporter)),
  ],
});
provider.register();

afterAll(async () => {
  await provider.shutdown();
});

test("Genkit spans reach the exporter without the brief or the reply", async () => {
  disableGenkitOTelInitialization();
  const ai = genkit({});
  mockModel(ai, { respond: { text: JSON.stringify(passingReply) } });
  await createDesignJudge(ai, "mockModel")(demoBrief);
  const spans = exporter.getFinishedSpans();
  const genkitSpans = spans.filter((span) =>
    Object.keys(span.attributes).some((key) => key.startsWith("genkit:"))
  );
  expect(genkitSpans.length).toBeGreaterThan(0);
  const exported = JSON.stringify(spans.map((span) => span.attributes));
  expect(exported).not.toContain("Japanese Cat Sunset");
  expect(exported).not.toContain(passingReply.coach);
  for (const span of genkitSpans) {
    expect(span.attributes).not.toHaveProperty("genkit:input");
    expect(span.attributes).not.toHaveProperty("genkit:output");
    // The rest of the span still reads through.
    expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/u);
    expect(span.attributes).toHaveProperty("genkit:name");
  }
});
