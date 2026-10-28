import type { Core } from "@wovain/core/core";
import type { FlagName } from "@wovain/core/flag-registry";
import type { FlagContext } from "@wovain/core/flags";
import { describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { researchSourcesFor } from "./ideas";

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
  it("runs Qloo on every plan with the taste map on", async () => {
    const { actor } = actorWith({
      "qloo-taste-map": true,
      "tavily-evidence": true,
      "trends-qloo": true,
      "trends-tavily": true,
    });

    expect(await researchSourcesFor(actor)).toEqual({
      evidence: true,
      qloo: true,
      tasteMap: true,
      tavily: true,
    });
  });

  it("runs Qloo on every plan with the taste map off", async () => {
    const { actor } = actorWith({ "trends-qloo": true, "trends-tavily": true });

    expect(await researchSourcesFor(actor)).toEqual({
      evidence: false,
      qloo: true,
      tasteMap: false,
      tavily: true,
    });
  });

  it("passes the merchant's real plan to every flag", async () => {
    const { actor, isOn } = actorWith({ "trends-tavily": true });

    await researchSourcesFor(actor);

    expect(isOn).toHaveBeenCalledTimes(4);
    for (const [, context] of isOn.mock.calls) {
      expect(context).toEqual({ plan: "studio", userId: "u1" });
    }
  });

  it("runs without Qloo when the merchant turns it off", async () => {
    const { actor } = actorWith({
      "qloo-taste-map": true,
      "trends-qloo": true,
      "trends-tavily": true,
    });

    expect(await researchSourcesFor(actor, { qloo: false })).toEqual({
      evidence: false,
      qloo: false,
      tasteMap: true,
      tavily: true,
    });
  });

  it("ignores the merchant's choice while the taste map is off", async () => {
    const { actor } = actorWith({ "trends-qloo": true, "trends-tavily": true });

    const sources = await researchSourcesFor(actor, { qloo: false });

    expect(sources.qloo).toBe(true);
  });

  it("keeps trends-qloo as the kill switch", async () => {
    const { actor } = actorWith({
      "qloo-taste-map": true,
      "trends-tavily": true,
    });

    const sources = await researchSourcesFor(actor);

    expect(sources.qloo).toBe(false);
  });
});
