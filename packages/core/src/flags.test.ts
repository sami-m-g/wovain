import { log } from "evlog";
import type { FeatureFlagEvaluations } from "posthog-node";
import { describe, expect, it, vi } from "vitest";

import { FLAGS, FLAG_NAMES } from "./flag-registry";
import { ANONYMOUS, createFlags } from "./flags";
import type { Exposure, FlagClient, FlagsConfig } from "./flags";

vi.mock(import("evlog"), async (original) => {
  const evlog = await original();
  return { ...evlog, log: { ...evlog.log, error: vi.fn() } };
});

const configured: FlagsConfig = {
  APP_ENV: "production",
  BETTER_AUTH_URL: "https://wovain.com",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
  POSTHOG_SECRET_KEY: "phs_test",
};

// PostHog's local evaluation: `flags` holds the definitions' answers (absent:
// not in PostHog), `ready` whether the definitions loaded.
const fakePostHog = (ready: boolean, flags: Record<string, boolean>) => {
  const client = {
    capture: vi.fn(),
    evaluateFlags: vi.fn(
      async () =>
        await Promise.resolve({
          getFlag: (key: string) => flags[key],
          isEnabled: (key: string) => flags[key] ?? false,
        } as unknown as FeatureFlagEvaluations)
    ),
    isLocalEvaluationReady: vi.fn(() => ready),
    waitForLocalEvaluationReady: vi.fn(
      async () => await Promise.resolve(ready)
    ),
  };
  return client satisfies FlagClient;
};

describe("createFlags", () => {
  it("answers from PostHog's local evaluation with the user, plan and environment", async () => {
    const exposures: Exposure[] = [];
    const posthog = fakePostHog(true, { "mastra-runs": true });
    const flags = createFlags(configured, {
      onExposure: (e) => exposures.push(e),
      posthog,
    });

    expect(await flags.isOn("mastra-runs", { userId: "u1" })).toBe(true);
    expect(posthog.evaluateFlags).toHaveBeenCalledWith("u1", {
      flagKeys: ["mastra-runs"],
      personProperties: { environment: "production", plan: "free" },
    });
    expect(exposures).toEqual([
      expect.objectContaining({
        enabled: true,
        environment: "production",
        flag: "mastra-runs",
        reason: "posthog",
      }),
    ]);
    // The SDK sends PostHog's own exposures.
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("keeps a flag PostHog switched off off, kill switches included", async () => {
    const posthog = fakePostHog(true, { "trends-tavily": false });
    const flags = createFlags(configured, { posthog });

    expect(await flags.isOn("trends-tavily", { userId: "u1" })).toBe(false);
  });

  it("evaluates requests without a user as anonymous", async () => {
    const posthog = fakePostHog(true, { "billing-paid-plans": false });
    const flags = createFlags(configured, { posthog });

    await flags.isOn("billing-paid-plans");

    expect(posthog.evaluateFlags).toHaveBeenCalledWith(
      ANONYMOUS,
      expect.anything()
    );
  });

  it("falls back to the registry when PostHog's definitions aren't loaded", async () => {
    const exposures: Exposure[] = [];
    const posthog = fakePostHog(false, {});
    const flags = createFlags(configured, {
      onExposure: (e) => exposures.push(e),
      posthog,
    });

    // Kill switches rolled out to everyone stay on through an outage.
    expect(await flags.isOn("trends-tavily", { userId: "u1" })).toBe(true);
    expect(await flags.isOn("trends-qloo", { userId: "u1" })).toBe(true);
    // Internal and percent rollouts stay closed.
    expect(await flags.isOn("app-ui-v2", { userId: "u1" })).toBe(false);
    expect(await flags.isOn("mastra-runs", { userId: "u1" })).toBe(false);
    expect(await flags.isOn("billing-paid-plans", { userId: "u1" })).toBe(
      false
    );
    expect(posthog.evaluateFlags).not.toHaveBeenCalled();
    expect(exposures[0]?.reason).toBe("fallback");
    // Every fallback reaches error tracking.
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: "FEATURE_FLAG_FALLBACK" })
    );
    // Registry answers are exposures too, once per user, flag and value.
    await flags.isOn("trends-tavily", { userId: "u1" });
    expect(posthog.capture).toHaveBeenCalledTimes(5);
    expect(posthog.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "u1",
        event: "$feature_flag_called",
        properties: expect.objectContaining({
          "$feature/trends-tavily": true,
          $feature_flag: "trends-tavily",
          flag_reason: "fallback",
        }),
      })
    );
  });

  it("answers from PostHog once a later poll loads the definitions", async () => {
    const posthog = fakePostHog(false, { "trends-tavily": false });
    const flags = createFlags(configured, { posthog });

    expect(await flags.isOn("trends-tavily", { userId: "u1" })).toBe(true);
    posthog.isLocalEvaluationReady.mockReturnValue(true);
    expect(await flags.isOn("trends-tavily", { userId: "u1" })).toBe(false);
  });

  it("falls back to the registry for a flag PostHog doesn't have", async () => {
    const posthog = fakePostHog(true, {});
    const flags = createFlags(configured, { posthog });

    expect(await flags.isOn("trends-tavily", { userId: "u1" })).toBe(true);
    expect(await flags.isOn("app-ui-v2", { userId: "u1" })).toBe(false);
  });

  it("runs Qloo for every plan, sending each merchant's real plan", async () => {
    const posthog = fakePostHog(true, { "trends-qloo": true });
    const flags = createFlags(configured, { posthog });

    const plans = ["free", "demo", "studio", "label"] as const;
    const answers = await Promise.all(
      plans.map(
        async (plan) => await flags.isOn("trends-qloo", { plan, userId: "u1" })
      )
    );

    expect(answers).toEqual([true, true, true, true]);
    for (const plan of plans) {
      expect(posthog.evaluateFlags).toHaveBeenCalledWith("u1", {
        flagKeys: ["trends-qloo"],
        personProperties: { environment: "production", plan },
      });
    }
  });

  it("answers from the registry without a secret key, production only for flags on for everyone", async () => {
    const flags = createFlags({
      ...configured,
      NEXT_PUBLIC_POSTHOG_KEY: undefined,
      POSTHOG_SECRET_KEY: undefined,
    });

    expect(await flags.isOn("trends-tavily")).toBe(true);
    expect(await flags.isOn("app-ui-v2")).toBe(false);
    expect(await flags.isOn("mastra-runs")).toBe(false);
    expect(await flags.isOn("billing-paid-plans")).toBe(false);
  });

  it("uses the development rollout when APP_ENV is unset, without a secret key", async () => {
    const exposures: Exposure[] = [];
    const flags = createFlags(
      {
        ...configured,
        APP_ENV: undefined,
        BETTER_AUTH_URL: "http://localhost:3000",
        NEXT_PUBLIC_POSTHOG_KEY: undefined,
        POSTHOG_SECRET_KEY: undefined,
      },
      { onExposure: (e) => exposures.push(e) }
    );

    expect(await flags.isOn("app-ui-v2")).toBe(true);
    expect(await flags.isOn("mastra-runs")).toBe(true);
    expect(await flags.isOn("billing-paid-plans")).toBe(false);
    expect(exposures[0]).toMatchObject({
      environment: "development",
      reason: "local",
    });
  });

  it("answers only flags rolled out to everyone on next", async () => {
    const flags = createFlags({
      ...configured,
      APP_ENV: "next",
      NEXT_PUBLIC_POSTHOG_KEY: undefined,
      POSTHOG_SECRET_KEY: undefined,
    });

    expect(await flags.isOn("mastra-runs")).toBe(true);
    expect(await flags.isOn("app-ui-v2")).toBe(false);
  });

  it("snapshots every registered flag", async () => {
    const flags = createFlags(configured, {
      posthog: fakePostHog(true, {}),
    });

    expect(Object.keys(await flags.snapshot({ userId: "u1" }))).toEqual(
      FLAG_NAMES
    );
  });
});

describe("the flag registry", () => {
  it("gives every flag an owner and a valid expiry", () => {
    for (const name of FLAG_NAMES) {
      const flag = FLAGS[name];
      expect(flag.owner.gitlab).not.toBe("");
      expect(Number.isNaN(Date.parse(flag.expires))).toBe(false);
    }
  });

  it("keeps billing-paid-plans off everywhere at launch", () => {
    const flag = FLAGS["billing-paid-plans"];
    expect(flag.initiallyActive).toBe(false);
    expect(flag.rollout.production.kind).toBe("off");
    expect(flag.rollout.development.kind).toBe("off");
  });

  it("keeps trends-qloo a pure kill switch, with no plan limit", () => {
    const flag: { plans?: unknown; type: string } = FLAGS["trends-qloo"];
    expect(flag.type).toBe("kill-switch");
    expect(flag.plans).toBeUndefined();
  });
});
