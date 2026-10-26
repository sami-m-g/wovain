import { PostHog } from "posthog-node";
import { InMemStorageProvider, initialize } from "unleash-client";
import type { Unleash } from "unleash-client";

import { FLAGS, FLAG_NAMES, INTERNAL_USER_ID } from "./flag-registry";
import type {
  FlagDefinition,
  FlagEnvironment,
  FlagName,
  FlagPlan,
} from "./flag-registry";

// GitLab feature flags through their Unleash client API, with Unleash's
// official Node SDK (docs.gitlab.com/operations/feature_flags: the API URL,
// the instance ID, and the environment as the app name). Flag names come
// from the typed registry (./flag-registry.ts), never from strings.
//
// Fail closed: until the SDK has fetched GitLab's flags, and for any flag
// GitLab doesn't return, the answer is false. State lives in memory only (no
// backup file), so a cold start without GitLab never serves stale flags.
// Without a URL and instance ID at all (local dev, tests), the registry
// answers instead: development follows its rollout, so a laptop still works,
// and production answers only flags rolled out to everyone there.
//
// Every first answer per user, flag and value is sent to PostHog as a
// `$feature_flag_called` event with `$feature/<flag>`, so any KPI breaks down
// by flag variant: the exposure event PostHog's experiments read, here for
// flags another provider evaluates.

export interface FlagContext {
  // The Better Auth user ID: GitLab's user lists and "Percent of users"
  // match it, and PostHog keys exposures by it.
  userId?: string | undefined;
  // Checked by the app against the flag's `plans` (GitLab has no Unleash
  // constraints). Unknown plans count as free, the only plan sold at launch.
  plan?: FlagPlan | undefined;
  // A team member (the WOVAIN_ALLOWED_EMAILS allowlist; flagContextOf in
  // packages/api derives it server-side). GitLab can't match a property, so
  // a team member is evaluated as INTERNAL_USER_ID, the `internal-only`
  // list's member; exposures still go to the real user ID.
  internal?: boolean | undefined;
}

export interface FlagsConfig {
  GITLAB_FEATURE_FLAGS_URL?: string | undefined;
  GITLAB_FEATURE_FLAGS_INSTANCE_ID?: string | undefined;
  GITLAB_FEATURE_FLAGS_ENVIRONMENT: string;
  NEXT_PUBLIC_POSTHOG_HOST: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string | undefined;
}

export interface Exposure {
  flag: FlagName;
  enabled: boolean;
  environment: FlagEnvironment;
  context: FlagContext;
  // gitlab: GitLab answered; plan: the plan allowlist said no; local: no
  // GitLab configured; closed: GitLab not reached yet, so off.
  reason: "gitlab" | "plan" | "local" | "closed";
}

// Polls every 15 s: a toggle in GitLab reaches every instance within that,
// and at one request per 15 s GitLab's per-IP limit allows about 125
// clients.
const REFRESH_MS = 15_000;
// Distinct (user, flag, value) exposures remembered per process.
const SEEN_MAX = 10_000;

const environmentOf = (name: string): FlagEnvironment =>
  name === "production" ? "production" : "development";

// What a flag is for a plan: free when unknown.
const allowedFor = (flag: FlagDefinition, plan: FlagPlan | undefined) =>
  flag.plans === undefined || flag.plans.includes(plan ?? "free");

// For a process with no GitLab configured: development follows its rollout;
// production fails closed except for a flag rolled out to everyone (a kill
// switch such as trends-tavily), so a missing secret never opens an
// internal or percent rollout to all users.
const localAnswer = (flag: FlagDefinition, environment: FlagEnvironment) => {
  const { kind } = flag.rollout[environment];
  if (!flag.initiallyActive) {
    return false;
  }
  return environment === "production" ? kind === "all" : kind !== "off";
};

export interface Flags {
  isOn: (name: FlagName, context?: FlagContext) => boolean;
  // Every flag for one user: what a server component hands to client code.
  snapshot: (context?: FlagContext) => Record<FlagName, boolean>;
  // Whether the SDK has GitLab's flags (health checks, canary verdicts).
  ready: () => boolean;
}

export const createFlags = (
  config: FlagsConfig,
  options: {
    // For tests: the Unleash client, and where exposures go.
    unleash?: Pick<Unleash, "isEnabled" | "isSynchronized">;
    onExposure?: (exposure: Exposure) => void;
  } = {}
): Flags => {
  const environment = environmentOf(config.GITLAB_FEATURE_FLAGS_ENVIRONMENT);
  const url = config.GITLAB_FEATURE_FLAGS_URL;
  const instanceId = config.GITLAB_FEATURE_FLAGS_INSTANCE_ID;
  const configured = url !== undefined && instanceId !== undefined;
  let { unleash } = options;
  const client = () => {
    if (!configured) {
      return;
    }
    unleash ??= initialize({
      appName: config.GITLAB_FEATURE_FLAGS_ENVIRONMENT,
      // GitLab's Unleash API takes no metrics.
      disableMetrics: true,
      instanceId,
      refreshInterval: REFRESH_MS,
      storageProvider: new InMemStorageProvider(),
      url,
    });
    return unleash;
  };

  // Start polling at boot, so the first requests find the flags fetched.
  client();

  const posthogKey = config.NEXT_PUBLIC_POSTHOG_KEY;
  const posthog =
    options.onExposure === undefined && posthogKey !== undefined
      ? new PostHog(posthogKey, { host: config.NEXT_PUBLIC_POSTHOG_HOST })
      : undefined;
  const seen = new Set<string>();
  const expose =
    options.onExposure ??
    ((exposure: Exposure) => {
      const distinctId = exposure.context.userId;
      if (posthog === undefined || distinctId === undefined) {
        return;
      }
      const key = `${distinctId}:${exposure.flag}:${exposure.enabled}`;
      if (seen.has(key)) {
        return;
      }
      if (seen.size >= SEEN_MAX) {
        seen.clear();
      }
      seen.add(key);
      posthog.capture({
        distinctId,
        event: "$feature_flag_called",
        properties: {
          $feature_flag: exposure.flag,
          $feature_flag_response: exposure.enabled,
          [`$feature/${exposure.flag}`]: exposure.enabled,
          environment: exposure.environment,
          flag_plan: exposure.context.plan ?? "free",
          flag_reason: exposure.reason,
          flag_source: "gitlab",
          internal: exposure.context.internal ?? false,
        },
      });
    });

  const evaluate = (
    name: FlagName,
    context: FlagContext
  ): Pick<Exposure, "enabled" | "reason"> => {
    const flag: FlagDefinition = FLAGS[name];
    if (!allowedFor(flag, context.plan)) {
      return { enabled: false, reason: "plan" };
    }
    const sdk = client();
    if (sdk === undefined) {
      return { enabled: localAnswer(flag, environment), reason: "local" };
    }
    if (!sdk.isSynchronized()) {
      return { enabled: false, reason: "closed" };
    }
    // A team member is the internal-only list's one member.
    const evaluatedAs =
      context.internal === true ? INTERNAL_USER_ID : context.userId;
    const enabled = sdk.isEnabled(
      name,
      {
        environment,
        properties: {
          internal: String(context.internal ?? false),
          plan: context.plan ?? "free",
        },
        ...(evaluatedAs === undefined ? {} : { userId: evaluatedAs }),
      },
      false
    );
    return { enabled, reason: "gitlab" };
  };

  const isOn = (name: FlagName, context: FlagContext = {}) => {
    const result = evaluate(name, context);
    expose({ context, environment, flag: name, ...result });
    return result.enabled;
  };

  return {
    isOn,
    ready: () => client()?.isSynchronized() ?? false,
    snapshot: (context = {}) =>
      Object.fromEntries(
        FLAG_NAMES.map((name) => [name, isOn(name, context)])
      ) as Record<FlagName, boolean>,
  };
};
