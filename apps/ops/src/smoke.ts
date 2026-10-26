import type { Exception } from "./sink.ts";

// Synthetic checks of the live site, as a visitor with no account: what a
// merchant hits first and what broke in production before without an
// exception (a sign-in 500, connect links redirecting to 0.0.0.0, a docs
// chat 503). They run after every production deploy (smoke:production) and
// on the ops schedule; each failure becomes a PostHog exception, so heal and
// the release guard see it like any other error. No account, no credentials:
// the sign-in check uses an address that can't exist.

export interface Sites {
  site: string;
  docs: string;
}

export interface CheckResult {
  check: string;
  method: string;
  path: string;
  ok: boolean;
  detail: string;
}

// OAuth providers whose connect links redirect; fal takes a key instead.
const OAUTH_PROVIDERS = ["fourthwall", "meta"] as const;
// RFC 2606 reserves .invalid: this account can never exist.
const NO_ACCOUNT = {
  email: "smoke-check@wovain.invalid",
  password: "smoke-check-not-a-password",
};
const TIMEOUT_MS = 15_000;

type Fetch = typeof globalThis.fetch;

interface Check {
  name: string;
  method: string;
  url: string;
  init?: RequestInit;
  // A failure's detail, or undefined when the response is right.
  verify: (
    response: Response
  ) => Promise<string | undefined> | string | undefined;
}

const redirectsWithin =
  (origin: string, path: string) => (response: Response) => {
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || location === null) {
      return `expected a redirect, got ${response.status}`;
    }
    const target = new URL(location, origin);
    if (target.origin !== origin) {
      return `redirected to ${target.origin}, not ${origin}`;
    }
    return target.pathname.endsWith(path)
      ? undefined
      : `redirected to ${target.pathname}, not ${path}`;
  };

const checksFor = ({ docs, site }: Sites): Check[] => {
  const { origin } = new URL(site);
  return [
    {
      method: "GET",
      name: "login-google",
      url: `${site}/login`,
      verify: async (response) => {
        if (response.status !== 200) {
          return `status ${response.status}`;
        }
        const html = await response.text();
        return html.includes("Continue with Google")
          ? undefined
          : "no Google button";
      },
    },
    {
      init: {
        body: JSON.stringify(NO_ACCOUNT),
        headers: { "content-type": "application/json", origin },
      },
      method: "POST",
      name: "sign-in-rejects",
      url: `${site}/api/auth/sign-in/email`,
      // 429 is the sign-in rate limit: also not a server fault.
      verify: (response) =>
        response.status === 401 || response.status === 429
          ? undefined
          : `expected 401, got ${response.status}`,
    },
    ...OAUTH_PROVIDERS.flatMap((provider): Check[] => [
      {
        method: "GET",
        name: `connect-${provider}-start`,
        url: `${site}/api/connections/${provider}/start`,
        // Signed out, it sends the visitor to sign in, on this site.
        verify: redirectsWithin(origin, "/login"),
      },
      {
        method: "GET",
        name: `connect-${provider}-callback`,
        // A declined consent: the one callback error that isn't reported.
        url: `${site}/api/connections/${provider}/callback?error=access_denied`,
        verify: redirectsWithin(origin, "/dashboard"),
      },
    ]),
    {
      method: "GET",
      name: "inngest",
      url: `${site}/api/inngest`,
      // In production the serve route has a signing key, so an unsigned GET
      // answers 401: the route is up and checking signatures. 200 is the dev
      // server; anything else means it's down or misrouted.
      verify: (response) =>
        response.status === 200 || response.status === 401
          ? undefined
          : `status ${response.status}`,
    },
    {
      init: {
        body: "{}",
        headers: { "content-type": "application/json" },
      },
      method: "POST",
      name: "docs-chat",
      // An empty question is refused before any model call.
      url: `${docs}/api/chat`,
      verify: (response) =>
        response.status < 500 ? undefined : `status ${response.status}`,
    },
  ];
};

export const runChecks = async (
  sites: Sites,
  fetch: Fetch = globalThis.fetch
): Promise<CheckResult[]> =>
  await Promise.all(
    checksFor(sites).map(async (check) => {
      const { pathname } = new URL(check.url);
      const base = { check: check.name, method: check.method, path: pathname };
      try {
        const response = await fetch(check.url, {
          ...check.init,
          method: check.method,
          redirect: "manual",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const failure = await check.verify(response);
        return {
          ...base,
          detail: failure ?? `status ${response.status}`,
          ok: failure === undefined,
        };
      } catch (error) {
        return {
          ...base,
          detail: error instanceof Error ? error.message : String(error),
          ok: false,
        };
      }
    })
  );

// A failed check as the exception PostHog groups by check.
export const smokeException = (
  result: CheckResult,
  sites: Sites
): Exception => ({
  environment: "production",
  extra: { check: result.check },
  fingerprint: result.check,
  message: `${result.check}: ${result.detail}`,
  method: result.method,
  name: "SmokeCheckFailed",
  path: result.path,
  site: new URL(result.check === "docs-chat" ? sites.docs : sites.site)
    .hostname,
  source: "smoke",
});
