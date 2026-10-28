import { posthog } from "posthog-js";

import type { Visitor } from "@/app/api/visitor/route";
import { ENV } from "@/env";
import { analyticsEnvironment } from "@/lib/analytics-environment";
import { consentRequired } from "@/lib/consent";
import { analyticsStarted } from "@/lib/consent-store";

// PostHog product analytics (posthog.com/docs/libraries/next-js), started
// from instrumentation-client.ts as the page loads. Consent follows PostHog's
// cookie banner setup: cookieless "on_reject" mode stores nothing in the
// browser and records no replays until the visitor accepts, and PostHog
// counts those visits with a server-side hash (infra/posthog/program.ts
// turns on "Cookieless server hash mode"). Where the law asks for an opt-in,
// or the country is unknown, the visitor starts opted out and sees the
// banner (lib/consent.ts, components/consent-banner.tsx); elsewhere consent
// is implied. Either way "Cookie settings" in the footer changes it, and a
// Global Privacy Control or Do Not Track signal counts as a no. Events go
// through this site's /ingest rewrite (next.config.ts). Without a key,
// analytics are off and every posthog.* call is a no-op.

// How long the page waits for /api/visitor before PostHog starts without it.
const VISITOR_TIMEOUT_MS = 1500;

// The country, from src/app/api/visitor/route.ts. Cookieless events reach
// PostHog without an IP address, so its GeoIP can't name their country.
const fetchVisitor = async (): Promise<Visitor | undefined> => {
  try {
    const response = await fetch("/api/visitor", {
      signal: AbortSignal.timeout(VISITOR_TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as Visitor) : undefined;
  } catch {
    return undefined;
  }
};

// Cookieless events also lose the user agent, so PostHog's bot detection
// ($virt_is_bot) sees every one of them as a bot. posthog-js already skips
// declared bots and WebDriver; Fingerprint's open-source BotD, run in the
// browser with its usage ping off, also catches headless and automated
// browsers that pose as Chrome (the scanners that find new domains).
const detectBot = async () => {
  try {
    const { load } = await import("@fingerprintjs/botd");
    const botd = await load({ monitoring: false });
    return botd.detect();
  } catch {
    // A check that can't run counts the visitor as human.
    return { bot: false } as const;
  }
};

// Properties every event carries, in PostHog's own names where it has one.
// `bot` is set only when true, so the project's test account filters
// (infra/posthog/program.ts) drop events where it is set.
const visitorProperties = async () => {
  const [visitor, botCheck] = await Promise.all([fetchVisitor(), detectBot()]);
  return {
    environment: analyticsEnvironment(window.location.hostname),
    ...(visitor?.country && {
      $geoip_country_code: visitor.country.code,
      $geoip_country_name: visitor.country.name,
    }),
    ...(botCheck.bot && { bot: true, bot_kind: botCheck.botKind }),
  };
};

const start = async (key: string) => {
  const properties = await visitorProperties();
  const askFirst = consentRequired();
  posthog.init(key, {
    api_host: "/ingest",
    // Every event, the first pageview included, carries the page's locale
    // (en, fr, es) and the visitor's properties. Set here rather than
    // registered, since accepting cookies resets super properties.
    before_send: (event) => {
      if (event !== null) {
        Object.assign(event.properties, properties, {
          locale: document.documentElement.lang,
        });
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
  // The banner and AnalyticsIdentity read PostHog's state: tell them it's up.
  analyticsStarted();
};

let started: Promise<void> | undefined;

/** Starts PostHog once, from instrumentation-client.ts. */
export const startAnalytics = () => {
  const key = ENV.NEXT_PUBLIC_POSTHOG_KEY;
  started ??= key === undefined ? Promise.resolve() : start(key);
  return started;
};

const identify = async (userId: string) => {
  await startAnalytics();
  if (posthog.get_distinct_id() !== userId) {
    posthog.identify(userId);
  }
};

/**
 * Analytics know a merchant by user id only, never the email, so server-side
 * funnel steps (sign_up from packages/auth, the rest from packages/api) join
 * this browser's visit. Until the visitor consents, PostHog is cookieless and
 * keeps the identity in memory only, and accepting starts a fresh one, so
 * every page load of a signed-in merchant, and every consent answer,
 * identifies again (once PostHog has started); repeat calls are skipped.
 */
export const identifyMerchant = (userId: string) => {
  void identify(userId);
};
