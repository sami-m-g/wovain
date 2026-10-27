import { log as evlog } from "evlog";
import { PostHog } from "posthog-node";
import type { FeatureFlagEvaluations } from "posthog-node";

import { FLAGS, FLAG_NAMES } from "./flag-registry";
import type {
  FlagDefinition,
  FlagEnvironment,
  FlagName,
  FlagPlan,
} from "./flag-registry";

// PostHog feature flags with PostHog's official Node SDK and server-side
// local evaluation (posthog.com/docs/feature-flags/local-evaluation): the SDK
// polls the flag definitions with a project secret API key
// (POSTHOG_SECRET_KEY, `feature_flag:read`) and evaluates them in process,
// never calling PostHog per request (strictLocalEvaluation). Flag names come
// from the typed registry (./flag-registry.ts), which Pulumi applies as
// PostHog flags (./flag-posthog.ts, infra/posthog/program.ts); every condition
// matches only what the app passes here: the user ID, `plan` and
// `environment`.
//
// PostHog decides whenever it has the flag: a flag switched off in PostHog
// (its Status, the kill switch) is off. Only when PostHog has no answer (the
// definitions aren't loaded after READY_MS, or the flag isn't in them) does
// the registry answer, per flag, so an outage can't switch off a kill switch
// such as trends-tavily: development follows its rollout, production only
// flags rolled out to everyone there, so a fallback never opens an internal
// or percent rollout to all users. Each fallback is logged at error level.
// Without a secret key at all (laptops, tests, Mastra Studio) the registry
// answers the same way, without the error. A flag's `plans` allowlist is also
// checked here first, so a plan outside it is off whoever answers.
//
// Exposures: the SDK sends `$feature_flag_called` (with `$feature/<flag>`)
// itself the first time per user, flag and value that PostHog decides, so
// any KPI breaks down by flag value. Registry answers get the same event from
// here, marked with `flag_reason`, so nothing is counted twice. Requests
// without a user evaluate under ANONYMOUS, whose exposures are dropped.

export interface FlagContext {
  // The Better Auth user ID: PostHog's percentages and the team condition
  // match it, and exposures are keyed by it.
  userId?: string | undefined;
  // Matched by the flag's `plan` condition and the app's allowlist. Unknown
  // plans count as free, the only plan sold at launch.
  plan?: FlagPlan | undefined;
}

export interface FlagsConfig {
  // wovain.com is production; every other host is development.
  BETTER_AUTH_URL: string;
  NEXT_PUBLIC_POSTHOG_HOST: string;
  NEXT_PUBLIC_POSTHOG_KEY?: string | undefined;
  POSTHOG_SECRET_KEY?: string | undefined;
}

export interface Exposure {
  flag: FlagName;
  enabled: boolean;
  environment: FlagEnvironment;
  context: FlagContext;
  // posthog: PostHog decided; plan: the plan allowlist said no; local: no
  // PostHog secret key configured; fallback: PostHog had no answer, so the
  // registry decided.
  reason: "posthog" | "plan" | "local" | "fallback";
}

// What ./flags.ts needs from the SDK (tests pass a fake).
export type FlagClient = Pick<
  PostHog,
  | "capture"
  | "evaluateFlags"
  | "isLocalEvaluationReady"
  | "waitForLocalEvaluationReady"
>;

// How long the first evaluations wait for the definitions after boot.
const READY_MS = 3000;
// Distinct (user, flag, value) registry exposures remembered per process.
const SEEN_MAX = 10_000;
// The distinct ID of evaluations without a user.
export const ANONYMOUS = "wovain-anonymous";

const environmentOf = (siteUrl: string): FlagEnvironment =>
  new URL(siteUrl).hostname === "wovain.com" ? "production" : "development";

// What a flag is for a plan: free when unknown.
const allowedFor = (flag: FlagDefinition, plan: FlagPlan | undefined) =>
  flag.plans === undefined || flag.plans.includes(plan ?? "free");

// The registry's answer when PostHog has none: development follows its
// rollout; production only a flag rolled out to everyone (a kill switch such
// as trends-tavily).
const registryAnswer = (flag: FlagDefinition, environment: FlagEnvironment) => {
  const { kind } = flag.rollout[environment];
  if (!flag.initiallyActive) {
    return false;
  }
  return environment === "production" ? kind === "all" : kind !== "off";
};

export interface Flags {
  isOn: (name: FlagName, context?: FlagContext) => Promise<boolean>;
  // Every flag for one user: what a server component hands to client code.
  snapshot: (context?: FlagContext) => Promise<Record<FlagName, boolean>>;
}

export const createFlags = (
  config: FlagsConfig,
  options: {
    // For tests: the SDK, and every answer as it is given.
    posthog?: FlagClient;
    onExposure?: (exposure: Exposure) => void;
  } = {}
): Flags => {
  const environment = environmentOf(config.BETTER_AUTH_URL);
  const key = config.NEXT_PUBLIC_POSTHOG_KEY;
  const secretKey = config.POSTHOG_SECRET_KEY;
  const posthog: FlagClient | undefined =
    options.posthog ??
    (key === undefined
      ? undefined
      : new PostHog(key, {
          // Anonymous evaluations don't count as exposures.
          // oxlint-disable-next-line eslint-plugin-unicorn/no-null
          before_send: (event) =>
            event.distinctId === ANONYMOUS ? null : event,
          host: config.NEXT_PUBLIC_POSTHOG_HOST,
          ...(secretKey === undefined ? {} : { secretKey }),
          strictLocalEvaluation: true,
        }));
  const evaluates = secretKey !== undefined && posthog !== undefined;
  // Started at boot, so the first requests find the definitions loaded.
  const ready = evaluates
    ? posthog.waitForLocalEvaluationReady(READY_MS)
    : Promise.resolve(false);

  const seen = new Set<string>();
  const expose = (exposure: Exposure) => {
    options.onExposure?.(exposure);
    const distinctId = exposure.context.userId;
    // PostHog's own answers were sent by the SDK.
    if (
      exposure.reason === "posthog" ||
      posthog === undefined ||
      distinctId === undefined
    ) {
      return;
    }
    const seenKey = `${distinctId}:${exposure.flag}:${exposure.enabled}`;
    if (seen.has(seenKey)) {
      return;
    }
    if (seen.size >= SEEN_MAX) {
      seen.clear();
    }
    seen.add(seenKey);
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
      },
    });
  };

  const fromPostHog = async (
    name: FlagName,
    context: FlagContext
  ): Promise<FeatureFlagEvaluations | undefined> => {
    if (!evaluates) {
      return;
    }
    // A boot without PostHog recovers when a later poll loads them.
    if (!((await ready) || posthog.isLocalEvaluationReady())) {
      return;
    }
    return await posthog.evaluateFlags(context.userId ?? ANONYMOUS, {
      flagKeys: [name],
      personProperties: { environment, plan: context.plan ?? "free" },
    });
  };

  const evaluate = async (
    name: FlagName,
    context: FlagContext
  ): Promise<Pick<Exposure, "enabled" | "reason">> => {
    const flag: FlagDefinition = FLAGS[name];
    if (!allowedFor(flag, context.plan)) {
      return { enabled: false, reason: "plan" };
    }
    if (!evaluates) {
      return { enabled: registryAnswer(flag, environment), reason: "local" };
    }
    const evaluations = await fromPostHog(name, context);
    // A conclusive false (Status off included) is PostHog's answer too.
    if (evaluations?.getFlag(name) !== undefined) {
      return { enabled: evaluations.isEnabled(name), reason: "posthog" };
    }
    const enabled = registryAnswer(flag, environment);
    evlog.error({
      error: "FEATURE_FLAG_FALLBACK",
      flags: { enabled, environment, flag: name },
      why:
        evaluations === undefined
          ? "PostHog's flag definitions aren't loaded"
          : "The flag isn't in PostHog's definitions",
    });
    return { enabled, reason: "fallback" };
  };

  const isOn = async (name: FlagName, context: FlagContext = {}) => {
    const result = await evaluate(name, context);
    expose({ context, environment, flag: name, ...result });
    return result.enabled;
  };

  return {
    isOn,
    snapshot: async (context = {}) =>
      Object.fromEntries(
        await Promise.all(
          FLAG_NAMES.map(async (name) => [name, await isOn(name, context)])
        )
      ) as Record<FlagName, boolean>,
  };
};
