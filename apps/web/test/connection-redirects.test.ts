import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const BIND_ORIGIN = "http://0.0.0.0:3001";

vi.mock("@/env.server", () => ({
  ENV: { BETTER_AUTH_URL: "https://wovain.com" },
}));
vi.mock("@/lib/evlog", () => ({
  useLogger: () => ({ error: vi.fn() }),
  withEvlog: <T>(handler: T) => handler,
}));
vi.mock("@/lib/router-client", () => ({
  routerClientFor: () =>
    Promise.resolve({
      connections: {
        complete: () =>
          Promise.resolve({
            connected: true,
            returnTo: "/dashboard/connections",
          }),
        connect: () => Promise.reject(new Error("unused")),
      },
    }),
}));

const params = { params: Promise.resolve({ provider: "fourthwall" }) };

describe("connection redirects behind the proxy", () => {
  it("sends the callback to the public origin, not the bind address", async () => {
    const { GET } =
      await import("../src/app/api/connections/[provider]/callback/route");
    const request = new NextRequest(
      `${BIND_ORIGIN}/api/connections/fourthwall/callback?code=c&state=s`
    );
    const response = await GET(request, params);
    expect(response.headers.get("location")).toBe(
      "https://wovain.com/dashboard/connections?connected=fourthwall"
    );
  });

  it("sends an invalid callback to the public origin", async () => {
    const { GET } =
      await import("../src/app/api/connections/[provider]/callback/route");
    const request = new NextRequest(
      `${BIND_ORIGIN}/api/connections/fourthwall/callback`
    );
    const response = await GET(request, params);
    expect(response.headers.get("location")).toBe(
      "https://wovain.com/dashboard?connection_error=invalid_callback"
    );
  });
});
