import type { FeatureFlagEvaluations } from "posthog-node";
import { expect, it, vi } from "vitest";

import { createFlags } from "./flags";
import type { FlagClient } from "./flags";

// No flag in the registry has a plan allowlist today, so this one gets one
// here: the app must check it whatever PostHog says.
vi.mock(import("./flag-registry"), async (original) => {
  const registry = await original();
  return {
    ...registry,
    FLAGS: {
      ...registry.FLAGS,
      "trends-qloo": { ...registry.FLAGS["trends-qloo"], plans: ["free"] },
    },
  };
});

it("keeps a plan-limited flag off for other plans whatever PostHog says", async () => {
  const posthog = {
    capture: vi.fn(),
    evaluateFlags: vi.fn(
      async () =>
        await Promise.resolve({
          getFlag: () => true,
          isEnabled: () => true,
        } as unknown as FeatureFlagEvaluations)
    ),
    isLocalEvaluationReady: vi.fn(() => true),
    waitForLocalEvaluationReady: vi.fn(async () => await Promise.resolve(true)),
  } satisfies FlagClient;
  const flags = createFlags(
    {
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://wovain.com",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      POSTHOG_SECRET_KEY: "phs_test",
    },
    { posthog }
  );

  expect(await flags.isOn("trends-qloo", { plan: "studio" })).toBe(false);
  expect(await flags.isOn("trends-qloo", { plan: "demo" })).toBe(false);
  expect(await flags.isOn("trends-qloo", { plan: "free" })).toBe(true);
  // No plan counts as free, the only plan sold at launch.
  expect(await flags.isOn("trends-qloo")).toBe(true);
  expect(posthog.evaluateFlags).toHaveBeenCalledTimes(2);
});
