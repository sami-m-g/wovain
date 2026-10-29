import type {
  LaunchFacts,
  OpenStep,
} from "@/components/onboarding/launch-steps";
import {
  currentStep,
  launchProgress,
} from "@/components/onboarding/launch-steps";

/** A next step on the Home: an open launch step, or "done" once built. */
export type NextStep = OpenStep | "done";

/** The Home's next step, from the same facts the onboarding steps read. */
export const nextStepOf = (facts: LaunchFacts): NextStep =>
  currentStep(launchProgress(facts)) ?? "done";

/**
 * Where a next step is done: one place per step. Picking what to sell, and
 * the next drop once a campaign is built, point at what sells now (an
 * anchor on the Home): null.
 */
export const nextHref = (step: NextStep, run?: string) => {
  if (step === "store") {
    return "/dashboard/store" as const;
  }
  if (step === "meta") {
    // Meta's setup cards and the spend limits, as the onboarding step.
    return {
      pathname: "/dashboard/onboarding" as const,
      query: { step: "meta" },
    };
  }
  if (step === "design" || step === "ads") {
    return run === undefined
      ? ("/dashboard/new" as const)
      : { pathname: "/dashboard/new" as const, query: { run } };
  }
  return null;
};
