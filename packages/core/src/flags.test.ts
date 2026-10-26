import { describe, expect, it, vi } from "vitest";

import { FLAGS, FLAG_NAMES } from "./flag-registry";
import { createFlags } from "./flags";
import type { Exposure, FlagsConfig } from "./flags";

const configured: FlagsConfig = {
  GITLAB_FEATURE_FLAGS_ENVIRONMENT: "production",
  GITLAB_FEATURE_FLAGS_INSTANCE_ID: "instance",
  GITLAB_FEATURE_FLAGS_URL:
    "https://gitlab.example/api/v4/feature_flags/unleash/1",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
};

const fakeUnleash = (synced: boolean, on: Set<string>) => ({
  isEnabled: vi.fn((name: string) => on.has(name)),
  isSynchronized: () => synced,
});

describe("createFlags", () => {
  it("fails closed until GitLab's flags are fetched", () => {
    const exposures: Exposure[] = [];
    const flags = createFlags(configured, {
      onExposure: (e) => exposures.push(e),
      unleash: fakeUnleash(false, new Set(["trends-tavily"])),
    });

    expect(flags.isOn("trends-tavily", { userId: "u1" })).toBe(false);
    expect(flags.ready()).toBe(false);
    expect(exposures[0]?.reason).toBe("closed");
  });

  it("answers from GitLab and reports the exposure", () => {
    const exposures: Exposure[] = [];
    const unleash = fakeUnleash(true, new Set(["mastra-runs"]));
    const flags = createFlags(configured, {
      onExposure: (e) => exposures.push(e),
      unleash,
    });

    expect(flags.isOn("mastra-runs", { userId: "u1" })).toBe(true);
    expect(unleash.isEnabled).toHaveBeenCalledWith(
      "mastra-runs",
      expect.objectContaining({ userId: "u1" }),
      false
    );
    expect(exposures).toEqual([
      expect.objectContaining({
        enabled: true,
        environment: "production",
        flag: "mastra-runs",
        reason: "gitlab",
      }),
    ]);
  });

  it("evaluates team members as the internal-only list's member", () => {
    const unleash = fakeUnleash(true, new Set(["app-ui-v2"]));
    const exposures: Exposure[] = [];
    const flags = createFlags(configured, {
      onExposure: (e) => exposures.push(e),
      unleash,
    });

    flags.isOn("app-ui-v2", { internal: true, userId: "u1" });

    expect(unleash.isEnabled).toHaveBeenCalledWith(
      "app-ui-v2",
      expect.objectContaining({ userId: "wovain-internal" }),
      false
    );
    expect(exposures[0]?.context.userId).toBe("u1");
  });

  it("keeps Qloo off for paid plans whatever GitLab says", () => {
    const unleash = fakeUnleash(true, new Set(["trends-qloo"]));
    const flags = createFlags(configured, { onExposure: vi.fn(), unleash });

    expect(flags.isOn("trends-qloo", { plan: "studio" })).toBe(false);
    expect(flags.isOn("trends-qloo", { plan: "label" })).toBe(false);
    expect(flags.isOn("trends-qloo", { plan: "demo" })).toBe(true);
    expect(flags.isOn("trends-qloo", { plan: "free" })).toBe(true);
    // No plan counts as free, the only plan sold at launch.
    expect(flags.isOn("trends-qloo")).toBe(true);
    expect(unleash.isEnabled).toHaveBeenCalledTimes(3);
  });

  it("fails closed in production when GitLab isn't configured, except for flags on for everyone", () => {
    const flags = createFlags(
      { ...configured, GITLAB_FEATURE_FLAGS_URL: undefined },
      { onExposure: vi.fn() }
    );

    expect(flags.isOn("trends-tavily")).toBe(true);
    expect(flags.isOn("billing-polar")).toBe(false);
    expect(flags.isOn("mastra-runs")).toBe(false);
    expect(flags.isOn("billing-paid-plans")).toBe(false);
    expect(flags.isOn("fault-injection-checkout")).toBe(false);
  });

  it("uses the development rollout in development when GitLab isn't configured", () => {
    const flags = createFlags(
      {
        ...configured,
        GITLAB_FEATURE_FLAGS_ENVIRONMENT: "development",
        GITLAB_FEATURE_FLAGS_URL: undefined,
      },
      { onExposure: vi.fn() }
    );

    expect(flags.isOn("billing-polar")).toBe(true);
    expect(flags.isOn("mastra-runs")).toBe(true);
    expect(flags.isOn("billing-paid-plans")).toBe(false);
  });

  it("snapshots every registered flag", () => {
    const flags = createFlags(configured, {
      onExposure: vi.fn(),
      unleash: fakeUnleash(true, new Set()),
    });

    expect(Object.keys(flags.snapshot({ userId: "u1" }))).toEqual(FLAG_NAMES);
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

  it("limits Qloo to free and demo plans until judging ends", () => {
    expect(FLAGS["trends-qloo"].plans).toEqual(["free", "demo"]);
  });
});
