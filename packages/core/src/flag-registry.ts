// wovain's feature flags: the one list that PostHog's flags (./flag-posthog.ts
// to infra/posthog/flags.json, applied by Pulumi in infra/posthog/program.ts)
// and the app's SDK (./flags.ts) read. Pure data with no imports, so tools
// can import it by path. docs/adr/0001-progressive-delivery.md explains the
// design; AGENTS.md has the "roll out and roll back" steps.
//
// PostHog evaluates the rollout (a condition per environment) and the
// `plans` allowlist, which the app also checks. When PostHog has no answer,
// the registry does: in production only flags rolled out to everyone, so
// `on` must never be the safe state of a release flag.

// The plans a merchant can be on. `demo` is the hackathon judges' and
// internal demo accounts; at launch only `free` is sold (billing-paid-plans).
export const PLAN_CODES = ["free", "demo", "studio", "label"] as const;
export type FlagPlan = (typeof PLAN_CODES)[number];

// The environments a rollout is set for. The app passes its own as the
// `environment` property: production on wovain.com, development elsewhere.
export const FLAG_ENVIRONMENTS = ["production", "development"] as const;
export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];

// How far a flag is rolled out in one environment:
// - off: no condition, nobody gets it.
// - internal: team members, matched by their Better Auth user IDs
//   (the wovain:posthogInternalUserIds stack config, plus INTERNAL_USER_ID below).
// - percent: the team plus that percentage of users, sticky by user ID.
// - all: every user.
export type Rollout =
  | { kind: "off" }
  | { kind: "internal" }
  | { kind: "percent"; percent: number }
  | { kind: "all" };

// release: ships a change gradually, then is removed.
// kill-switch: on in normal operation; turning it off disables a dependency.
// permission: who may use something (plan or audience), long-lived.
// ops: test and demo harnesses.
export type FlagType = "release" | "kill-switch" | "permission" | "ops";

export interface FlagDefinition {
  description: string;
  // The team that answers for the flag, and the user the cleanup issue is
  // assigned to.
  owner: { team: string; gitlab: string };
  // ISO date. Past it, the hygiene check opens a cleanup issue.
  expires: string;
  type: FlagType;
  // PostHog's Status when Pulumi creates the flag. After that it is the
  // global kill switch, left to people and the release guard (ignored by
  // Pulumi, so flipping it is not drift).
  initiallyActive: boolean;
  rollout: Record<FlagEnvironment, Rollout>;
  // A `plan` condition in PostHog, checked by the app too: other plans get
  // `false` whoever answers.
  plans?: readonly FlagPlan[];
  // The release guard may switch it off on its own when production degrades
  // after the flag changed.
  guarded: boolean;
}

const OWNER = "sami-m-g";
const internalOnly = {
  development: { kind: "all" },
  production: { kind: "internal" },
} as const satisfies Record<FlagEnvironment, Rollout>;

export const FLAGS = {
  "app-ui-v2": {
    description: "The redesigned app UI (openspec app-ui-pass)",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "design" },
    rollout: internalOnly,
    type: "release",
  },
  autopilot: {
    description:
      "Autopilot: idea, product set, ads and a paused campaign without a human step",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: false,
    owner: { gitlab: OWNER, team: "runs" },
    rollout: internalOnly,
    type: "release",
  },
  "billing-paid-plans": {
    description:
      "Paid plans: checkout, plan changes and credit pack purchases (MR !116). Off at launch: only Free is sold",
    expires: "2027-01-31",
    guarded: true,
    initiallyActive: false,
    owner: { gitlab: OWNER, team: "billing" },
    rollout: { development: { kind: "off" }, production: { kind: "off" } },
    type: "permission",
  },
  "billing-polar": {
    description:
      "Polar billing paths from MR !116: credits, the billing page and webhooks",
    expires: "2026-12-15",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "billing" },
    rollout: internalOnly,
    type: "release",
  },
  "fal-oauth": {
    description:
      "Connect fal with OAuth instead of a pasted key (openspec add-fal-byo-connector)",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "connectors" },
    rollout: internalOnly,
    type: "release",
  },
  "mastra-runs": {
    description:
      "New runs go through the Mastra workflow; the legacy run steps are the fallback",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "runs" },
    rollout: {
      development: { kind: "all" },
      production: { kind: "percent", percent: 10 },
    },
    type: "release",
  },
  "trends-qloo": {
    description:
      "Qloo taste themes in trend research. Qloo hackathon terms: free and demo plans only until judging ends on 2026-11-05; paid plans get Tavily-only trends",
    expires: "2026-11-05",
    guarded: false,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "growth" },
    plans: ["free", "demo"],
    rollout: {
      development: { kind: "all" },
      production: { kind: "all" },
    },
    type: "kill-switch",
  },
  "trends-tavily": {
    description:
      "Live Tavily search in trend research (off: research returns no ideas)",
    expires: "2027-06-30",
    guarded: false,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "growth" },
    rollout: {
      development: { kind: "all" },
      production: { kind: "all" },
    },
    type: "kill-switch",
  },
} as const satisfies Record<string, FlagDefinition>;

export type FlagName = keyof typeof FLAGS;

export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[];

export const isFlagName = (name: string): name is FlagName =>
  Object.hasOwn(FLAGS, name);

// The team condition of `internal` and `percent` rollouts matches the team's
// Better Auth user IDs (infra/posthog's internal_user_ids), never an email or
// an app variable. This placeholder keeps the list non-empty before anyone is
// added. Percent rollouts include the team, so team members are always in.
export const INTERNAL_USER_ID = "wovain-internal";
