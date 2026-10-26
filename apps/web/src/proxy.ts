import { evlogMiddleware } from "evlog/next";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { CONSENT_REGION_COOKIE, consentRegionFor } from "@/lib/consent";

const logRequest = evlogMiddleware();
const localize = createIntlMiddleware(routing);

const WWW_PREFIX = "www.";
const PERMANENT_REDIRECT = 308;
// Files, Next internals, OAuth metadata and the PostHog proxy (/ingest,
// next.config.ts) keep their paths; pages get a locale.
const UNLOCALIZED = /^\/(?:_next|_vercel|\.well-known|ingest)\/|\.[^/]+$/u;
// A root-level file name or a .well-known document the app doesn't serve
// would otherwise fall into the [locale] segment and fail to render: answer
// 404 here instead. public/ keeps its files in folders (public/brand/).
const ROOT_FILE = /^\/[^/]+\.[^/]+$/u;
const ROOT_FILES = new Set([
  "/apple-icon.png",
  "/icon.png",
  "/icon.svg",
  "/llms.txt",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);
const UNKNOWN_WELL_KNOWN =
  /^\/\.well-known\/(?!oauth-authorization-server|oauth-protected-resource)/u;
const NOT_FOUND = 404;

// The visitor's country, from whichever edge is in front of the app: a
// Google Cloud load balancer's custom header set to {client_region},
// Cloudflare, or Vercel. Cloud Run domain mappings send none, and then the
// browser asks for consent (lib/consent.ts).
const COUNTRY_HEADERS = [
  "x-client-region",
  "cf-ipcountry",
  "x-vercel-ip-country",
];
const CONSENT_REGION_MAX_AGE = 60 * 60 * 24 * 30;

// Pages stay static: the proxy, not the page, reads the country, and hands
// the browser its consent rule in a cookie that PostHog's setup reads.
const withConsentRegion = (request: NextRequest, response: NextResponse) => {
  const country = COUNTRY_HEADERS.map((name) => request.headers.get(name)).find(
    (value) => value !== null && value !== ""
  );
  const region = consentRegionFor(country);
  const current = request.cookies.get(CONSENT_REGION_COOKIE)?.value;
  if (region !== undefined && region !== current) {
    response.cookies.set(CONSENT_REGION_COOKIE, region, {
      maxAge: CONSENT_REGION_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
  }
  return response;
};

export const proxy = (request: NextRequest) => {
  // www.wovain.com reaches this app through its own Cloud Run domain mapping,
  // which can't redirect, so the app sends it to the apex: one origin for
  // cookies, Better Auth's trusted origins and the OAuth issuer.
  const host = request.headers.get("host") ?? "";
  if (host.startsWith(WWW_PREFIX)) {
    const target = new URL(
      request.nextUrl.pathname,
      `https://${host.slice(WWW_PREFIX.length)}`
    );
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, PERMANENT_REDIRECT);
  }
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return logRequest(request);
  }
  const unknownFile =
    (ROOT_FILE.test(pathname) && !ROOT_FILES.has(pathname)) ||
    UNKNOWN_WELL_KNOWN.test(pathname);
  if (unknownFile) {
    return new NextResponse(null, { status: NOT_FOUND });
  }
  if (UNLOCALIZED.test(pathname)) {
    return NextResponse.next();
  }
  return withConsentRegion(request, localize(request));
};

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
