import type { Core } from "@wovain/core/core";
import type { FlagName } from "@wovain/core/flag-registry";
import type { FlagContext } from "@wovain/core/flags";
import { describe, expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { researchSourcesFor } from "./ideas";

// Flags as a merchant on a paid plan sees them: trends-qloo is limited to
// free and demo plans, so it is off whenever the plan is passed.
const actorWith = (on: Partial<Record<FlagName, boolean>>) => {
  const isOn = vi.fn(
    async (name: FlagName, context?: FlagContext) =>
      await Promise.resolve(
        name === "trends-qloo" && context?.plan === "studio"
          ? false
          : (on[name] ?? false)
      )
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
      "trends-qloo": true,
      "trends-tavily": true,
    });

    expect(await researchSourcesFor(actor)).toEqual({
      qloo: true,
      tasteMap: true,
      tavily: true,
    });
  });

  it("keeps the plan limit with the taste map off", async () => {
    const { actor } = actorWith({ "trends-qloo": true, "trends-tavily": true });

    expect(await researchSourcesFor(actor)).toEqual({
      qloo: false,
      tasteMap: false,
      tavily: true,
    });
  });

  it("runs without Qloo when the merchant turns it off", async () => {
    const { actor } = actorWith({
      "qloo-taste-map": true,
      "trends-qloo": true,
      "trends-tavily": true,
    });

    expect(await researchSourcesFor(actor, { qloo: false })).toEqual({
      qloo: false,
      tasteMap: true,
      tavily: true,
    });
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
