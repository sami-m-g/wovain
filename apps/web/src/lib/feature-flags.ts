import type { FlagName } from "@wovain/core/flag-registry";
import type { FlagContext } from "@wovain/core/flags";

import { core } from "@/services";

// GitLab feature flags for the web app's own routes: the typed registry
// (packages/core/src/flag-registry.ts) through the official Unleash SDK
// (packages/core/src/flags.ts). Off when GitLab can't be reached; each
// answer is a PostHog exposure for a signed-in user. Client components get
// values as props from a server component (core.flags.snapshot): GitLab has
// no Unleash frontend API, so the browser never asks GitLab.
export const isFlagOn = (name: FlagName, context?: FlagContext): boolean =>
  core.flags.isOn(name, context);
