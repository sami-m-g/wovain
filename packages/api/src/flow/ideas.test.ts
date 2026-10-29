import type { FlagName } from "@wovain/core/flag-registry";
import type { FlagContext } from "@wovain/core/flags";
import type { Core } from "@wovain/mastra/services";
import { describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { assertQlooOn, researchSourcesFor } from "./ideas";

// A merchant on a paid plan.
const actorWith = (on: Partial<Record<FlagName, boolean>>) => {
  const isOn = vi.fn(
    async (name: FlagName, _context?: FlagContext) =>
      await Promise.resolve(on[name] ?? false)
  );
  const actor = {
    core: { flags: { isOn } } as unknown as Core,
    plan: "studio",
    userId: "u1",
  } as unknown as Actor;
  return { actor, isOn };
};

describe("researchSourcesFor", () => {
  it("adds Tavily evidence when its flag is on", async () => {
    const { actor } = actorWith({
      "tavily-evidence": true,
      "trends-tavily": true,
    });

    expect(await researchSourcesFor(actor)).toEqual({
      evidence: true,
      evidenceGate: false,
      tavily: true,
    });
  });

  it("has no Qloo switch: Qloo is never optional", async () => {
    const { actor } = actorWith({ "trends-tavily": true });

    expect(await researchSourcesFor(actor)).toEqual({
      evidence: false,
      evidenceGate: false,
      tavily: true,
    });
  });

  it("turns the evidence gate on with its flag", async () => {
    const { actor } = actorWith({
      "idea-evidence-gate": true,
      "trends-tavily": true,
    });

    expect(await researchSourcesFor(actor)).toMatchObject({
      evidenceGate: true,
    });
  });

  it("passes the merchant's real plan to every flag", async () => {
    const { actor, isOn } = actorWith({ "trends-tavily": true });

    await researchSourcesFor(actor);

    expect(isOn).toHaveBeenCalledTimes(3);
    for (const [, context] of isOn.mock.calls) {
      expect(context).toEqual({ plan: "studio", userId: "u1" });
    }
  });
});

describe("assertQlooOn", () => {
  it("lets research start while trends-qloo is on", async () => {
    const { actor } = actorWith({ "trends-qloo": true });

    await expect(assertQlooOn(actor)).resolves.toBeUndefined();
  });

  it("refuses with QLOO_OFF when the kill switch is off", async () => {
    const { actor } = actorWith({ "trends-tavily": true });

    await expect(assertQlooOn(actor)).rejects.toMatchObject({
      code: "QLOO_OFF",
      status: 503,
    });
  });
});
