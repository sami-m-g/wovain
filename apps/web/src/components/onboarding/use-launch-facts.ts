"use client";

import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import type { LaunchFacts } from "./launch-steps";

// Polled while the run works, so a step ticks off when the merchant returns.
const RUN_POLL_MS = 3000;

/**
 * What wovain knows about the merchant's way to a first campaign: the one
 * source of truth for setup. The onboarding flow and the Home's next action
 * both read it, and the store step reads the same store setup checklist the
 * Store page shows. Brand is optional and is not a setup step.
 */
export const useLaunchFacts = (runId: string | undefined, brief?: string) => {
  const status = useQuery(orpc.onboarding.status.queryOptions());
  const ready = status.data?.enabled === true ? status.data : undefined;
  const fourthwallConnected =
    ready?.connections.some(
      (each) => each.provider === "fourthwall" && each.state === "connected"
    ) ?? false;
  const store = useQuery({
    ...orpc.store.setup.queryOptions(),
    enabled: fourthwallConnected,
    retry: false,
  });
  const run = useQuery({
    ...orpc.runs.get.queryOptions({ input: { id: runId ?? "" } }),
    enabled: runId !== undefined,
    refetchInterval: (query) =>
      (query.state.data?.campaigns.length ?? 0) > 0 ? false : RUN_POLL_MS,
  });
  // The same query <MetaSetup /> polls, so the step ticks off with its cards.
  const meta = useQuery({
    ...orpc.store.metaSetup.queryOptions(),
    retry: false,
  });
  // The store checklist's required steps, as the Store page counts them.
  const storeSteps = store.data?.steps.filter((step) => step.required) ?? [];
  // Store setup answers 404 while its flag is off: connecting is enough then.
  const storeReady =
    store.isError ||
    (store.data !== undefined &&
      storeSteps.every((step) => step.state === "done"));
  const metaLinked =
    ready?.connections.some(
      (each) => each.provider === "meta" && each.state === "connected"
    ) ?? false;
  // Without the Meta setup check (flag off), a connected Meta is enough.
  const metaReady = meta.isError
    ? metaLinked
    : meta.data !== undefined &&
      meta.data.connected &&
      meta.data.steps
        .filter((step) => step.required)
        .every((step) => step.state === "done");
  const facts: LaunchFacts = {
    brief: brief ?? run.data?.seed,
    fourthwallConnected,
    guardrailsSet: ready
      ? ready.autonomy === null || ready.steps.autonomy
      : false,
    metaConnected: metaReady,
    run: run.data,
    storeReady,
  };
  return {
    facts,
    ready,
    run: run.data,
    status,
    store: {
      done: storeSteps.filter((step) => step.state === "done").length,
      total: storeSteps.length,
    },
  };
};

export type LaunchData = ReturnType<typeof useLaunchFacts>;
