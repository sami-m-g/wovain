import { initialize } from "unleash-client";
import type { Unleash } from "unleash-client";

import { ENV } from "@/env.server";

// GitLab feature flags through their Unleash API (Deploy > Feature flags >
// Configure). Without the URL and instance ID every flag is off. The client
// polls every 15 seconds, so a toggle in GitLab reaches the app within that.
let client: Unleash | undefined;

export const FAULT_INJECTION_CHECKOUT = "fault-injection-checkout";

// Runs go to the durable Mastra workflow only while this is on for the
// merchant (packages/api/src/workflows/rollout.ts); a typed flag registry
// replaces these names later.
export const MASTRA_RUNS = "mastra-runs";

// `userId` lets a gradual rollout or user-list strategy pick the merchant.
export const isFlagOn = (name: string, userId?: string): boolean => {
  const url = ENV.GITLAB_FEATURE_FLAGS_URL;
  const instanceId = ENV.GITLAB_FEATURE_FLAGS_INSTANCE_ID;
  if (url === undefined || instanceId === undefined) {
    return false;
  }
  client ??= initialize({
    appName: ENV.GITLAB_FEATURE_FLAGS_ENVIRONMENT,
    disableMetrics: true,
    instanceId,
    refreshInterval: 15_000,
    url,
  });
  return client.isEnabled(name, userId === undefined ? {} : { userId });
};
