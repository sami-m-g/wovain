import { evlogMiddleware } from "evlog/next";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const logRequest = evlogMiddleware();

const WWW_PREFIX = "www.";
const PERMANENT_REDIRECT = 308;

// www.wovain.com reaches this app through its own Cloud Run domain mapping,
// which can't redirect, so the app sends it to the apex: one origin for
// cookies, Better Auth's trusted origins and the OAuth issuer.
export const proxy = (request: NextRequest) => {
  const host = request.headers.get("host") ?? "";
  if (host.startsWith(WWW_PREFIX)) {
    const target = new URL(
      request.nextUrl.pathname,
      `https://${host.slice(WWW_PREFIX.length)}`
    );
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, PERMANENT_REDIRECT);
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return logRequest(request);
  }
  return NextResponse.next();
};

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
