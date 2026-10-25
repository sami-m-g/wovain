import { initialize } from "unleash-client";
import type { Unleash } from "unleash-client";

import { ENV } from "@/env.server";

// GitLab feature flags through their Unleash API (Deploy > Feature flags >
// Configure). Without the URL and instance ID every flag is off. The client
// polls every 15 seconds, so a toggle in GitLab reaches the app within that.
let client: Unleash | undefined;

export const FAULT_INJECTION_CHECKOUT = "fault-injection-checkout";

export const isFlagOn = (name: string): boolean => {
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
  return client.isEnabled(name);
};
