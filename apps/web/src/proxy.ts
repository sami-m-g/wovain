import { evlogMiddleware } from "evlog/next";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

const logRequest = evlogMiddleware();
const localize = createIntlMiddleware(routing);

const WWW_PREFIX = "www.";
const PERMANENT_REDIRECT = 308;
// Files, Next internals, OAuth metadata and the PostHog proxy (/ingest,
// next.config.ts) keep their paths; pages get a locale.
const UNLOCALIZED = /^\/(?:_next|_vercel|\.well-known|ingest)\/|\.[^/]+$/u;

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
  if (UNLOCALIZED.test(pathname)) {
    return NextResponse.next();
  }
  return localize(request);
};

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
