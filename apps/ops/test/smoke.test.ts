import { describe, expect, it } from "vitest";

import { runChecks, smokeException } from "../src/smoke.ts";

// The synthetic checks against a fake site: the healthy answers pass, and
// the production failures of 2026-10-26 fail.
const sites = { docs: "https://docs.wovain.com", site: "https://wovain.com" };

const redirect = (location: string) =>
  new Response(null, { headers: { location }, status: 302 });

const healthy = (url: string, init?: RequestInit): Response => {
  const { pathname } = new URL(url);
  if (pathname === "/login") {
    return new Response("<button>Continue with Google</button>");
  }
  if (pathname === "/api/auth/sign-in/email" && init?.method === "POST") {
    return new Response("{}", { status: 401 });
  }
  if (pathname.endsWith("/start")) {
    return redirect("https://wovain.com/login");
  }
  if (pathname.endsWith("/callback")) {
    return redirect(
      "https://wovain.com/dashboard?connection_error=access_denied"
    );
  }
  if (pathname === "/api/chat") {
    return new Response("{}", { status: 400 });
  }
  return new Response("{}");
};

const fakeFetch =
  (answer: (url: string, init?: RequestInit) => Response) =>
  (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(answer(String(input), init));

const broken = (url: string, init?: RequestInit) => {
  const { pathname } = new URL(url);
  if (pathname === "/api/auth/sign-in/email") {
    return new Response("{}", { status: 500 });
  }
  if (pathname.startsWith("/api/connections/")) {
    return redirect("https://0.0.0.0:3001/login");
  }
  if (pathname === "/api/chat") {
    return new Response("{}", { status: 503 });
  }
  return healthy(url, init);
};

describe("runChecks", () => {
  it("passes a healthy site", async () => {
    const results = await runChecks(sites, fakeFetch(healthy));
    expect(results.filter((r) => !r.ok)).toStrictEqual([]);
  });

  it("fails a sign-in 500, a redirect to 0.0.0.0 and a docs chat 503", async () => {
    const results = await runChecks(sites, fakeFetch(broken));
    const failed = results.filter((r) => !r.ok).map((r) => r.check);
    expect(failed).toStrictEqual([
      "sign-in-rejects",
      "connect-fourthwall-start",
      "connect-fourthwall-callback",
      "connect-meta-start",
      "connect-meta-callback",
      "docs-chat",
    ]);
  });

  it("reports a failure as a smoke exception grouped by check", () => {
    expect(
      smokeException(
        {
          check: "docs-chat",
          detail: "status 503",
          method: "POST",
          ok: false,
          path: "/api/chat",
        },
        sites
      )
    ).toMatchObject({
      fingerprint: "docs-chat",
      name: "SmokeCheckFailed",
      site: "docs.wovain.com",
      source: "smoke",
    });
  });
});
