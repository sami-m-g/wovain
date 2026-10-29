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

// The environments a rollout is set for. The app passes its own, APP_ENV
// (set per Cloud Run service by infra/), as the `environment` property:
// production on wovain.com, next on next.wovain.com (main, for judges, so
// it follows production's rollouts), development elsewhere.
export const FLAG_ENVIRONMENTS = ["production", "next", "development"] as const;
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
  next: { kind: "internal" },
  production: { kind: "internal" },
} as const satisfies Record<FlagEnvironment, Rollout>;

// New work for the Qloo and Nebius demo on next.wovain.com: on in dev and
// next, off in production (frozen until 2026-11-16).
const devAndNext = {
  development: { kind: "all" },
  next: { kind: "all" },
  production: { kind: "off" },
} as const satisfies Record<FlagEnvironment, Rollout>;

// The flags of the workstreams that build on foundation-autonomy-approvals,
// declared together so their pull requests don't conflict on this file.
const workstream = (team: string, description: string) =>
  ({
    description,
    expires: "2027-01-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team },
    rollout: devAndNext,
    type: "release",
  }) as const satisfies FlagDefinition;

export const FLAGS = {
  "ads-optimizer": workstream(
    "media",
    "Thompson-sampling optimizer over ads: reallocation proposals inside the spend caps"
  ),
  "app-ui-v2": {
    description: "The redesigned app UI (openspec app-ui-pass)",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "design" },
    rollout: internalOnly,
    type: "release",
  },
  "autonomy-approvals": {
    description:
      "The shared approval queue and the merchant's autonomy settings (openspec foundation-autonomy-approvals)",
    expires: "2027-01-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "runs" },
    rollout: devAndNext,
    type: "release",
  },
  autopilot: {
    description:
      "Autopilot: idea, product set, ads and a paused campaign without a human step. On for every plan, Free included, in dev and next (foundation-autonomy-approvals)",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "runs" },
    rollout: { ...devAndNext, production: { kind: "internal" } },
    type: "release",
  },
  "autopilot-triggers": workstream(
    "runs",
    "Autopilot fires on trend and Qloo triggers and files suggestions"
  ),
  "billing-paid-plans": {
    description:
      "Paid plans: checkout, plan changes and credit pack purchases (MR !116). Off at launch: only Free is sold",
    expires: "2027-01-31",
    guarded: true,
    initiallyActive: false,
    owner: { gitlab: OWNER, team: "billing" },
    rollout: {
      development: { kind: "off" },
      next: { kind: "off" },
      production: { kind: "off" },
    },
    type: "permission",
  },
  "brand-discovery": workstream(
    "growth",
    "Guided brand discovery in onboarding: Qloo-found starter brands (Suggest for me, a short questionnaire), the buyers panel and per-field suggestions"
  ),
  "design-drops": workstream(
    "design",
    "Drops: a capsule of products sharing a palette, mark and style family"
  ),
  "drop-style": workstream(
    "design",
    "Each drop's own tone and palette, suggested from its Qloo audience and the brand defaults, used by the brief and ad writers"
  ),
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
  "feedback-loop": workstream(
    "growth",
    "Performance snapshots feed scores, taste and the next suggestions"
  ),
  "mastra-runs": {
    description:
      "New runs go through the Mastra workflow; the legacy run steps are the fallback",
    expires: "2026-12-31",
    guarded: true,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "runs" },
    rollout: {
      development: { kind: "all" },
      next: { kind: "percent", percent: 10 },
      production: { kind: "percent", percent: 10 },
    },
    type: "release",
  },
  "media-buying-live": workstream(
    "media",
    "Launch Meta campaigns live after an approval, inside the merchant's spend caps"
  ),
  "mobile-app": workstream(
    "mobile",
    "The Expo app: approval inbox, push notifications and the store pulse"
  ),
  "model-routing": workstream(
    "agents",
    "Route each agent to a Nemotron model by job (NEMOTRON_MODEL_FAST, _DEFAULT, _REASONING, _VISION, _SAFETY)"
  ),
  "onboarding-wizard": workstream(
    "growth",
    "The brand wizard: taste references, Qloo entities, voice, palette, niches and the autonomy level"
  ),
  "qloo-audiences": workstream(
    "growth",
    "Qloo audience demographics drive Meta targeting and the ad persona"
  ),
  "qloo-taste-map": workstream(
    "growth",
    "The Qloo taste map: the entities, tags and cross-domain links behind each idea"
  ),
  "store-management": workstream(
    "store",
    "Store actions on Fourthwall (publish, retire, reprice, promotions, orders) through the approval queue"
  ),
  "tavily-competition": workstream(
    "growth",
    "Tavily competitive landscape per Qloo theme: saturation, how competitors sell and the audience's gaps, fed to the brief, the ad writer and autopilot"
  ),
  "tavily-evidence": workstream(
    "growth",
    "Tavily evidence with citations: per-search failures logged, competitor prices, research dossiers and the trademark check"
  ),
  "trends-qloo": {
    description:
      "Qloo taste themes in trend research, for every plan (founder decision, 2026-10-28). An ops kill switch only: off, research and new runs are refused with QLOO_OFF, since every idea is a Qloo tag",
    expires: "2027-06-30",
    guarded: false,
    initiallyActive: true,
    owner: { gitlab: OWNER, team: "growth" },
    rollout: {
      development: { kind: "all" },
      next: { kind: "all" },
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
      next: { kind: "all" },
      production: { kind: "all" },
    },
    type: "kill-switch",
  },
  "voice-input": workstream(
    "mobile",
    "Hold-to-talk: speech to text, then a typed action proposal in the approval queue"
  ),
  "who-buys": workstream(
    "growth",
    "Who buys this and where on each idea, from Qloo alone: demographics, ranked audiences, heatmap cities and the fashion brands the fans like"
  ),
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
