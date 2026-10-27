import {
  FLAG_ENVIRONMENTS,
  FLAGS,
  FLAG_NAMES,
  INTERNAL_USER_ID,
} from "./flag-registry";
import type { FlagDefinition, FlagEnvironment } from "./flag-registry";

// The registry as PostHog feature flags: what infra/posthog/program.ts applies
// with Pulumi. ./flag-posthog.test.ts writes it to infra/posthog/flags.json
// (a Vitest file snapshot: `pnpm --filter @wovain/core exec vitest run -u`
// after a registry change), so CI fails while the two differ.
//
// Every condition matches only properties the app passes to local evaluation
// (./flags.ts): `environment`, `plan`, and the user ID as `distinct_id`, so the
// SDK never has to ask PostHog's servers. A rollout becomes, per environment:
// - off: no condition.
// - internal: a condition with `internal: true`, which program.ts turns into
//   `distinct_id` in the team's Better Auth user IDs (wovain:posthogInternalUserIds
//   and INTERNAL_USER_ID).
// - percent: that condition plus the percentage of all users, sticky by user.
// - all: every user.
// A flag's `plans` allowlist is a condition on `plan` in each of them.

interface PostHogProperty {
  key: "environment" | "plan";
  operator: "exact";
  type: "person";
  value: string[];
}

export interface PostHogCondition {
  // infra/posthog/program.ts adds the team's user IDs to this condition.
  internal: boolean;
  properties: PostHogProperty[];
  rollout_percentage: number;
}

export interface PostHogFlag {
  // The initial Status. Like GitLab's toggle before, it is then the kill
  // switch: Pulumi ignores it after creation.
  active: boolean;
  groups: PostHogCondition[];
  name: string;
  tags: string[];
}

const ALL_USERS = 100;

const conditionsFor = (
  flag: FlagDefinition,
  environment: FlagEnvironment
): PostHogCondition[] => {
  const properties: PostHogProperty[] = [
    {
      key: "environment",
      operator: "exact",
      type: "person",
      value: [environment],
    },
    ...(flag.plans === undefined
      ? []
      : [
          {
            key: "plan",
            operator: "exact",
            type: "person",
            value: [...flag.plans],
          } satisfies PostHogProperty,
        ]),
  ];
  const internal = {
    internal: true,
    properties,
    rollout_percentage: ALL_USERS,
  };
  const rollout = flag.rollout[environment];
  switch (rollout.kind) {
    case "off": {
      return [];
    }
    case "internal": {
      return [internal];
    }
    case "percent": {
      return [
        internal,
        { internal: false, properties, rollout_percentage: rollout.percent },
      ];
    }
    case "all": {
      return [{ internal: false, properties, rollout_percentage: ALL_USERS }];
    }
    default: {
      throw new Error(`Unknown rollout ${JSON.stringify(rollout)}`);
    }
  }
};

// A flag off everywhere gets one explicit 0% condition rather than an empty
// list, whose meaning PostHog's API and UI may default. Nobody matches 0%.
const NOBODY: PostHogCondition = {
  internal: false,
  properties: [],
  rollout_percentage: 0,
};

export const posthogFlag = (flag: FlagDefinition): PostHogFlag => {
  const groups = FLAG_ENVIRONMENTS.flatMap((environment) =>
    conditionsFor(flag, environment)
  );
  return {
    active: flag.initiallyActive,
    groups: groups.length === 0 ? [NOBODY] : groups,
    name: `${flag.description} (owner: ${flag.owner.team}, expires ${flag.expires}). Managed in packages/core/src/flag-registry.ts.`,
    tags: ["registry", flag.type],
  };
};

export interface PostHogFlags {
  flags: Record<string, PostHogFlag>;
  // Always in the team condition, so it is never empty.
  internal_user_id: string;
}

export const posthogFlags = (): PostHogFlags => ({
  flags: Object.fromEntries(
    FLAG_NAMES.map((name) => [name, posthogFlag(FLAGS[name])])
  ),
  internal_user_id: INTERNAL_USER_ID,
});
