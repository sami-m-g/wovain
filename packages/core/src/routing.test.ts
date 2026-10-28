import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { createMockModel } from "@mastra/core/test-utils/llm-mock";
import { describe, expect, it, vi } from "vitest";

import { scoreAdCopy, writeAdCopy } from "./ads";
import { AGENT_IDS, AGENT_ROLES, createAgentKit } from "./agents";
import type { AgentKit } from "./agents";
import { createModelRouter } from "./model-router";
import { createNemotron, withLlmTrace } from "./nemotron";
import { fakeAgents } from "./test-doubles";
import { DecisionTrace } from "./trace";

// Model routing: with the model-routing flag on for a call, each agent runs
// on its job's Nemotron model, the call lands in the decision trace with
// that model, and buyer-facing copy may only state what the tools gave it.

const router = createModelRouter({
  NEMOTRON_MODEL_DEFAULT: "m-default",
  NEMOTRON_MODEL_FAST: "m-fast",
  NEMOTRON_MODEL_REASONING: "m-reasoning",
  NEMOTRON_MODEL_SAFETY: "m-safety",
  NEMOTRON_MODEL_VISION: "m-vision",
});

const kitConfig = {
  apiKey: "test",
  baseURL: "https://example.test/v1/",
  environment: "test",
  guardThresholds: { injection: 0.8, moderation: 0.8, pii: 0.8 },
  model: "m-legacy",
  posthogHost: "https://example.test",
  pricePerMillion: { input: 0, output: 0 },
  visionModel: "m-legacy-vision",
};

describe("agent kit routing", () => {
  it("runs each agent on its job's model only when routed", () => {
    const kit = createAgentKit({ ...kitConfig, router });
    expect(kit?.modelFor("design_brief", true)).toBe("m-default");
    expect(kit?.modelFor("design_judge", true)).toBe("m-reasoning");
    expect(kit?.modelFor("autopilot_review_design", true)).toBe("m-reasoning");
    expect(kit?.modelFor("design_vision", true)).toBe("m-vision");
    expect(kit?.modelFor("ad_judge", true)).toBe("m-fast");
    expect(kit?.modelFor("design_brief", false)).toBe("m-legacy");
    expect(kit?.modelFor("design_vision", false)).toBe("m-legacy-vision");
  });

  it("keeps the legacy models without a router", () => {
    const kit = createAgentKit(kitConfig);
    expect(kit?.modelFor("design_judge", true)).toBe("m-legacy");
  });

  it("gives every agent a role", () => {
    expect(Object.keys(AGENT_ROLES).toSorted()).toEqual(
      [...AGENT_IDS].toSorted()
    );
    expect(new Set(Object.values(AGENT_ROLES))).toEqual(
      new Set(["default", "fast", "reasoning", "vision"])
    );
  });
});

// A kit whose ad_copy agent answers `variants` every time.
const adKit = (variants: unknown) => {
  const generate = vi.fn();
  const agent = new Agent({
    id: "ad_copy",
    instructions: "Answer with JSON only.",
    model: createMockModel({
      mockText: { variants },
      spyGenerate: generate,
      version: "v2",
    }) as MastraModelConfig,
    name: "ad_copy",
  });
  const kit = {
    agents: { ad_copy: agent },
    modelFor: (_id: string, routed: boolean) =>
      routed ? "m-default" : "m-legacy",
  } as unknown as AgentKit;
  return { generate, kit };
};

const product = { description: "Two lines.", idea: "moths", title: "Moth tee" };
const honest = [
  { angle: "humor", headline: "Moths love it", message: "A moth tee." },
  { angle: "gift", headline: "Gift a moth", message: "For moth people." },
];
const invented = [
  { angle: "humor", headline: "Loved by 10,000", message: "A moth tee." },
  { angle: "gift", headline: "Best-selling moth", message: "For moths." },
];

const traced = <T>(routed: boolean, run: () => Promise<T>) => {
  const decisions = new DecisionTrace({ runId: "r1", userId: "u1" });
  const result = withLlmTrace(
    { decisions, distinctId: "u1", routed, traceId: "r1" },
    run
  );
  return { decisions, result };
};

describe("routed agent calls", () => {
  it("records the call with its model in the decision trace", async () => {
    const { kit } = adKit(honest);
    const { decisions, result } = traced(
      true,
      async () => await writeAdCopy(createNemotron(kit), product)
    );
    await expect(result).resolves.toEqual(honest);
    expect(
      decisions.entries.map((entry) => [entry.agent, entry.model, entry.ok])
    ).toEqual([
      ["ad_copy", "m-default", true],
      ["grounding_guard", undefined, true],
    ]);
    expect(decisions.entries[0]?.inputSummary).toBe(
      "input: description, idea, title"
    );
  });

  it("sends invented numbers and claims back once, then fails", async () => {
    const { generate, kit } = adKit(invented);
    const { decisions, result } = traced(
      true,
      async () => await writeAdCopy(createNemotron(kit), product)
    );
    await expect(result).rejects.toThrow("10,000");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(
      decisions.entries
        .filter((entry) => entry.agent === "grounding_guard")
        .map((entry) => entry.output)
    ).toEqual([
      { unsupported: ["10,000", "Best-selling"] },
      { unsupported: ["10,000", "Best-selling"] },
    ]);
  });

  it("leaves unrouted calls unguarded, as before", async () => {
    const { kit } = adKit(invented);
    const { decisions, result } = traced(
      false,
      async () => await writeAdCopy(createNemotron(kit), product)
    );
    await expect(result).resolves.toEqual(invented);
    expect(decisions.entries.map((entry) => entry.model)).toEqual(["m-legacy"]);
  });
});

describe("scoreAdCopy", () => {
  it("scores the share of passed ad-judge verdicts", async () => {
    const { ask, asked } = fakeAgents({
      ad_judge: [
        { critique: "Clear angle.", result: "Pass" },
        { critique: "Fine.", result: "Pass" },
        { critique: "Vague.", result: "Fail" },
        { critique: "Fine.", result: "Pass" },
      ],
    });
    const scored = await scoreAdCopy(ask, { copy: honest, title: "Moth tee" });
    expect(asked).toHaveLength(4);
    expect(scored.score).toBe(75);
    expect(scored.verdicts.filter((verdict) => !verdict.pass)).toHaveLength(1);
  });
});
