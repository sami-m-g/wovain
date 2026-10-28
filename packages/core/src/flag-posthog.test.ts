import { describe, expect, it } from "vitest";

import { posthogFlag, posthogFlags } from "./flag-posthog";
import { FLAGS } from "./flag-registry";
import type { FlagDefinition } from "./flag-registry";

const flag = (overrides: Partial<FlagDefinition>): FlagDefinition => ({
  description: "A flag",
  expires: "2027-01-01",
  guarded: true,
  initiallyActive: true,
  owner: { gitlab: "owner", team: "team" },
  rollout: {
    development: { kind: "off" },
    next: { kind: "off" },
    production: { kind: "off" },
  },
  type: "release",
  ...overrides,
});

const environment = (value: string) => ({
  key: "environment",
  operator: "exact",
  type: "person",
  value: [value],
});

describe("the registry as PostHog flags", () => {
  it("is what infra/posthog/flags.json holds", async () => {
    // `vitest run -u` rewrites the file after a registry change.
    await expect(
      `${JSON.stringify(posthogFlags(), null, 2)}\n`
    ).toMatchFileSnapshot("../../../infra/posthog/flags.json");
  });

  it("turns each rollout into conditions per environment", () => {
    const { groups } = posthogFlag(
      flag({
        rollout: {
          development: { kind: "all" },
          next: { kind: "off" },
          production: { kind: "percent", percent: 10 },
        },
      })
    );

    expect(groups).toEqual([
      {
        internal: true,
        properties: [environment("production")],
        rollout_percentage: 100,
      },
      {
        internal: false,
        properties: [environment("production")],
        rollout_percentage: 10,
      },
      {
        internal: false,
        properties: [environment("development")],
        rollout_percentage: 100,
      },
    ]);
  });

  it("gives internal rollouts the team condition only", () => {
    const { groups } = posthogFlag(
      flag({
        rollout: {
          development: { kind: "off" },
          next: { kind: "internal" },
          production: { kind: "internal" },
        },
      })
    );

    expect(groups).toEqual([
      {
        internal: true,
        properties: [environment("production")],
        rollout_percentage: 100,
      },
      {
        internal: true,
        properties: [environment("next")],
        rollout_percentage: 100,
      },
    ]);
  });

  it("matches nobody when a flag is off everywhere", () => {
    expect(posthogFlag(FLAGS["billing-paid-plans"])).toMatchObject({
      active: false,
      groups: [{ internal: false, properties: [], rollout_percentage: 0 }],
    });
  });

  it("adds the plan allowlist to every condition", () => {
    const { groups } = posthogFlag(FLAGS["trends-qloo"]);

    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(group.properties).toContainEqual({
        key: "plan",
        operator: "exact",
        type: "person",
        value: ["free", "demo"],
      });
    }
  });
});
