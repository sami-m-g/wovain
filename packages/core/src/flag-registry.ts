// wovain's feature flags: the one list that GitLab's flags (infra/gitlab.ts,
// Pulumi), the app's SDK (./flags.ts) and the hygiene check (apps/ops) read.
// Pure data with no imports, so Pulumi (Node's type stripping) and the ops
// job can import it by path. docs/adr/0001-progressive-delivery.md explains
// the design; AGENTS.md has the "roll out and roll back" steps.
//
// GitLab evaluates the rollout (Unleash strategies per environment); GitLab
// has no Unleash constraints, so a flag's `plans` allowlist is checked by the
// app on top of GitLab's answer. Every flag is off when GitLab is unreachable
// (fail closed), so `on` must never be the safe state of a flag.

// The plans a merchant can be on. `demo` is the hackathon judges' and
// internal demo accounts; at launch only `free` is sold (billing-paid-plans).
export const PLAN_CODES = ["free", "demo", "studio", "label"] as const;
export type FlagPlan = (typeof PLAN_CODES)[number];

// The GitLab environments whose names the Unleash client sends as its app
// name (GITLAB_FEATURE_FLAGS_ENVIRONMENT).
export const FLAG_ENVIRONMENTS = ["production", "development"] as const;
export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number];

// How far a flag is rolled out in one environment:
// - off: no strategy, nobody gets it.
// - internal: the `internal-only` GitLab user list: team members, as the
//   app's WOVAIN_ALLOWED_EMAILS allowlist says (INTERNAL_USER_ID below).
// - percent: the user list plus that percentage of signed-in users, sticky
//   by user ID (GitLab's "Percent of users", Unleash gradualRolloutUserId).
// - all: every user (GitLab's "All users", Unleash default).
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
  // The team that answers for the flag, and the GitLab user the cleanup
  // issue is assigned to.
  owner: { team: string; gitlab: string };
  // ISO date. Past it, the hygiene check opens a cleanup issue.
  expires: string;
  type: FlagType;
  // GitLab's status toggle when Pulumi creates the flag. After that it is the
  // global kill switch, left to people and the release guard (ignored by
  // Pulumi, so flipping it is not drift).
  initiallyActive: boolean;
  rollout: Record<FlagEnvironment, Rollout>;
  // Evaluated by the app: other plans get `false` whatever GitLab says.
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
  "fault-injection-checkout": {
    description:
      "Injects a checkout failure so the self-healing loop can detect, fix and verify it",
    expires: "2027-03-31",
    guarded: true,
    initiallyActive: false,
    owner: { gitlab: OWNER, team: "platform" },
    // Development only: its Status on never touches production. The
    // canary demo faults one production revision instead
    // (FAULT_INJECTION_REVISION).
    rollout: {
      development: { kind: "all" },
      production: { kind: "off" },
    },
    type: "ops",
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

// The GitLab user list every `internal` and `percent` rollout includes.
export const INTERNAL_USER_LIST = "internal-only";

// The list's one member. GitLab's strategies match user IDs only (no Unleash
// constraints), so the SDK evaluates a team member (`internal: true`, from
// the WOVAIN_ALLOWED_EMAILS allowlist) as this user ID; nobody keeps a list
// of real IDs. Percent rollouts include the list, so team members are always
// in.
export const INTERNAL_USER_ID = "wovain-internal";
