import { posthog } from "posthog-js";

import { ENV } from "@/env";

// PostHog product analytics (posthog.com/docs/libraries/next-js), loaded
// before the app hydrates. Cookieless: nothing is stored in the browser and
// PostHog counts visitors with a server-side hash, so no consent banner is
// needed (the project needs "Cookieless server hash mode" on). Events go
// through this site's /ingest rewrite (next.config.ts). Without a key,
// analytics are off and every posthog.* call is a no-op.
const key = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const PRODUCTION_HOST = "wovain.com";
if (key !== undefined) {
  posthog.init(key, {
    api_host: "/ingest",
    // Every event carries the page's locale (en, fr, es).
    before_send: (event) => {
      if (event !== null) {
        event.properties["locale"] = document.documentElement.lang;
      }
      return event;
    },
    // What PostHog senses for the self-driving loop (docs/flows.md): dead
    // clicks next to rage clicks, unhandled exceptions for error tracking,
    // and web vitals.
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true },
    cookieless_mode: "always",
    // PostHog's recommended settings as of this date: pageviews on
    // client-side navigation, autocapture.
    defaults: "2026-08-30",
    ui_host: ENV.NEXT_PUBLIC_POSTHOG_HOST.replace(
      ".i.posthog.com",
      ".posthog.com"
    ),
  });
  // One image serves wovain.com and dev.wovain.com, so the host, not a
  // build-time value, tells their events apart.
  posthog.register({
    environment:
      window.location.hostname === PRODUCTION_HOST
        ? "production"
        : "development",
  });
}
