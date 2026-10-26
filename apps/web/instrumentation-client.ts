import { posthog } from "posthog-js";

import { ENV } from "@/env";
import { consentRequired } from "@/lib/consent";

// PostHog product analytics (posthog.com/docs/libraries/next-js), loaded
// before the app hydrates. Consent follows PostHog's cookie banner setup:
// cookieless "on_reject" mode stores nothing in the browser and records no
// replays until the visitor accepts, and PostHog counts those visits with a
// server-side hash (the project needs "Cookieless server hash mode" on).
// Where the law asks for an opt-in, or the country is unknown, the visitor
// starts opted out and sees the banner (lib/consent.ts,
// components/consent-banner.tsx); elsewhere consent is implied. Either way
// "Cookie settings" in the footer changes it, and a Global Privacy Control or
// Do Not Track signal counts as a no. Events go through this site's /ingest
// rewrite (next.config.ts). Without a key, analytics are off and every
// posthog.* call is a no-op.
const key = ENV.NEXT_PUBLIC_POSTHOG_KEY;
const PRODUCTION_HOST = "wovain.com";
if (key !== undefined) {
  const askFirst = consentRequired();
  const environment =
    window.location.hostname === PRODUCTION_HOST ? "production" : "development";
  posthog.init(key, {
    api_host: "/ingest",
    // Every event carries the page's locale (en, fr, es) and its
    // environment: one image serves wovain.com and dev.wovain.com, so the
    // host, not a build-time value, tells their events apart. Set here
    // rather than registered, since accepting cookies resets super
    // properties.
    before_send: (event) => {
      if (event !== null) {
        event.properties["locale"] = document.documentElement.lang;
        event.properties["environment"] = environment;
      }
      return event;
    },
    // What PostHog senses for the self-driving loop (docs/flows.md): dead
    // clicks next to rage clicks, unhandled exceptions for error tracking,
    // and web vitals.
    capture_dead_clicks: true,
    capture_exceptions: true,
    capture_performance: { web_vitals: true },
    cookieless_mode: "on_reject",
    // PostHog's recommended settings as of this date: pageviews on
    // client-side navigation, autocapture.
    defaults: "2026-08-30",
    // Opted out, so cookieless, until the banner's answer.
    opt_out_capturing_by_default: askFirst,
    respect_dnt: true,
    // Replays (on for the project, after consent only) mask every input
    // value, and the text under .ph-mask: the dashboard, the auth pages and
    // the account menu. .ph-no-capture blocks an element entirely.
    session_recording: {
      maskAllInputs: true,
      maskTextClass: "ph-mask",
    },
    ui_host: ENV.NEXT_PUBLIC_POSTHOG_HOST.replace(
      ".i.posthog.com",
      ".posthog.com"
    ),
  });
  // Implied consent: opt in, without an $opt_in event, unless the visitor
  // already chose. PostHog stores the choice, so later visits skip this.
  if (!askFirst && posthog.get_explicit_consent_status() === "pending") {
    posthog.opt_in_capturing({ captureEventName: false });
  }
}
