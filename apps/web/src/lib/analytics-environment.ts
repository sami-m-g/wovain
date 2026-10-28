// The `environment` property every PostHog event carries, from the host that
// served it: one image runs wovain.com, qloo.wovain.com and dev.wovain.com,
// so no build-time value can tell them apart. The project's test account
// filters (infra/posthog/program.ts) drop everything but production.

// wovain.com and the hosts that serve the same app (www redirects to it,
// mcp serves ChatGPT).
const PRODUCTION_HOSTS = new Set([
  "wovain.com",
  "www.wovain.com",
  "mcp.wovain.com",
]);
// Where main deploys while production is frozen (docs/adr/0004-release-branch.md).
const QLOO_HOST = "qloo.wovain.com";

export type AnalyticsEnvironment = "production" | "qloo" | "development";

export const analyticsEnvironment = (
  hostname: string
): AnalyticsEnvironment => {
  if (PRODUCTION_HOSTS.has(hostname)) {
    return "production";
  }
  return hostname === QLOO_HOST ? "qloo" : "development";
};
