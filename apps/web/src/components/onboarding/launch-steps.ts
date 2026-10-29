/**
 * The one guided flow from sign-in to a running campaign: which steps are
 * done, from what wovain already knows. Pure, so the shell, the checklist and
 * the tests read the same answer.
 */
export const LAUNCH_STEPS = [
  "signin",
  "sell",
  "store",
  "meta",
  "design",
  "ads",
] as const;

export type LaunchStep = (typeof LAUNCH_STEPS)[number];

/** The steps a merchant works through; signed in is done on arrival. */
export const OPEN_STEPS = LAUNCH_STEPS.filter(
  (step): step is Exclude<LaunchStep, "signin"> => step !== "signin"
);
export type OpenStep = (typeof OPEN_STEPS)[number];

/** The north star: sign-in to a running campaign within ten minutes. */
export const TARGET_MINUTES = 10;
const MINUTE_MS = 60_000;
const SECOND_MS = 1000;
const PAD = 2;

export interface LaunchFacts {
  /** The brief picked from the drop directions, or the run's seed. */
  brief?: string | undefined;
  fourthwallConnected: boolean;
  /** Every required store setup step is done (or store setup is off). */
  storeReady: boolean;
  metaConnected: boolean;
  /** Autonomy level and spend caps saved (or autonomy is off). */
  guardrailsSet: boolean;
  run?:
    | {
        campaigns: readonly { createdAt: Date | string }[];
        designs: readonly { status: string }[];
      }
    | undefined;
}

export type LaunchProgress = Record<LaunchStep, boolean>;

export const launchProgress = (facts: LaunchFacts): LaunchProgress => {
  const designs = facts.run?.designs ?? [];
  return {
    ads: (facts.run?.campaigns.length ?? 0) > 0,
    design: designs.some((design) => design.status === "approved"),
    meta: facts.metaConnected && facts.guardrailsSet,
    sell: (facts.brief ?? "").trim() !== "",
    signin: true,
    store: facts.fourthwallConnected && facts.storeReady,
  };
};

/** The first step not done yet; undefined once the campaign exists. */
export const currentStep = (progress: LaunchProgress): OpenStep | undefined =>
  OPEN_STEPS.find((step) => !progress[step]);

export const doneCount = (progress: LaunchProgress) =>
  LAUNCH_STEPS.filter((step) => progress[step]).length;

/** When the first campaign was created: where the timer stops. */
export const launchedAt = (facts: LaunchFacts): Date | undefined => {
  const times = (facts.run?.campaigns ?? []).map((campaign) =>
    new Date(campaign.createdAt).getTime()
  );
  return times.length === 0 ? undefined : new Date(Math.min(...times));
};

/** Elapsed time as m:ss, never negative. */
export const clockOf = (elapsedMs: number) => {
  const seconds = Math.max(0, Math.floor(elapsedMs / SECOND_MS));
  const minutes = Math.floor(seconds / (MINUTE_MS / SECOND_MS));
  const rest = seconds % (MINUTE_MS / SECOND_MS);
  return `${minutes}:${String(rest).padStart(PAD, "0")}`;
};

export const withinTarget = (elapsedMs: number) =>
  elapsedMs <= TARGET_MINUTES * MINUTE_MS;
