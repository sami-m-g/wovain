import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { afterAll, describe, expect, test } from "vitest";

import { countStep, FUNNEL_METRIC, stepOf } from "../../src/lib/funnel.ts";

describe("stepOf", () => {
  test.each([
    ["show_design_widget", {}, "idea"],
    ["show_design_widget", { id: "d1" }, undefined],
    ["publish_design", { id: "d1" }, "set_approved"],
    ["record_design", { status: "skipped" }, undefined],
    ["record_ad", { status: "added" }, "ad_approved"],
    ["record_ad", { status: "skipped" }, undefined],
    ["show_campaign_widget", { status: "ready" }, "campaign_created"],
    ["show_campaign_widget", { status: "blocked" }, undefined],
    ["create_rules", { campaignId: "1" }, "autopilot_run"],
    ["get_settings", {}, undefined],
  ])("%s %o is %s", (tool, args, step) => {
    expect(stepOf(tool, args)).toBe(step);
  });
});

describe("countStep", () => {
  const exporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE
  );
  const provider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exportIntervalMillis: 60_000,
        exporter,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(provider);
  afterAll(async () => {
    await provider.shutdown();
    metrics.disable();
  });

  test("counts each step with only the step as an attribute", async () => {
    countStep("idea");
    countStep("idea");
    countStep("set_approved");
    await provider.forceFlush();
    const metric = exporter
      .getMetrics()
      .flatMap((batch) => batch.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .find((m) => m.descriptor.name === FUNNEL_METRIC);
    const points = metric?.dataPoints.map((p) => [p.attributes, p.value]);
    expect(points).toEqual([
      [{ "wovain.funnel.step": "idea" }, 2],
      [{ "wovain.funnel.step": "set_approved" }, 1],
    ]);
  });
});
