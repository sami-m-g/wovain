import { describe, expect, it } from "vitest";

import { createModelRouter } from "./model-router";
import { DecisionTrace, INPUT_SUMMARY_MAX } from "./trace";
import type { TraceEntry, TraceScope } from "./trace";

const AT = new Date("2026-10-28T12:00:00Z");

describe("DecisionTrace", () => {
  it("records calls in order, failures included, and saves each once", async () => {
    const saved: TraceEntry[][] = [];
    const sink = (_scope: TraceScope, entries: TraceEntry[]) => {
      saved.push(entries);
      return Promise.resolve();
    };
    const trace = new DecisionTrace(
      { runId: "r1", userId: "u1" },
      sink,
      () => AT
    );
    const themes = await trace.call(
      { agent: "trends", inputSummary: "seed: y2k", step: "qloo.insights" },
      () => Promise.resolve(["racing"]),
      (result) => ({
        output: result,
        sources: [{ id: "q1", provider: "qloo" }],
      })
    );
    expect(themes).toEqual(["racing"]);
    await expect(
      trace.call(
        { agent: "judge", inputSummary: "x".repeat(900), step: "judge" },
        () => Promise.reject(new Error("Nebius 503")),
        () => ({ output: null })
      )
    ).rejects.toThrow("Nebius 503");
    await trace.flush();
    await trace.flush();
    expect(saved).toHaveLength(1);
    expect(
      saved[0]?.map((entry) => [entry.seq, entry.agent, entry.ok])
    ).toEqual([
      [0, "trends", true],
      [1, "judge", false],
    ]);
    expect(saved[0]?.[1]?.inputSummary).toHaveLength(INPUT_SUMMARY_MAX);
    expect(saved[0]?.[1]?.output).toEqual({ error: "Nebius 503" });
  });
});

describe("createModelRouter", () => {
  const env = {
    NEMOTRON_MODEL_DEFAULT: "m-default",
    NEMOTRON_MODEL_FAST: "m-fast",
    NEMOTRON_MODEL_REASONING: "m-reasoning",
    NEMOTRON_MODEL_SAFETY: "m-safety",
    NEMOTRON_MODEL_VISION: "m-vision",
  };

  it("gives each role its env var's model", () => {
    const router = createModelRouter(env);
    expect(router.modelFor("fast")).toBe("m-fast");
    expect(router.modelFor("vision")).toBe("m-vision");
    expect(router.models.reasoning).toBe("m-reasoning");
  });

  it("refuses an empty model ID, naming the variable", () => {
    expect(() =>
      createModelRouter({ ...env, NEMOTRON_MODEL_SAFETY: " " })
    ).toThrow("NEMOTRON_MODEL_SAFETY");
  });
});
