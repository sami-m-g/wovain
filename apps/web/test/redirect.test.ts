import { describe, expect, it } from "vitest";

import { redirectWithin, sameSiteUrl } from "../src/lib/redirect";

const origin = "https://wovain.com";

describe("sameSiteUrl", () => {
  it("keeps a path on this site and encodes the query", () => {
    expect(
      sameSiteUrl({
        origin,
        query: { connection_error: "a&b=c#d" },
        target: "/dashboard/connections?x=1",
      }).href
    ).toBe(
      "https://wovain.com/dashboard/connections?x=1&connection_error=a%26b%3Dc%23d"
    );
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com/x", "\\\\evil.com"])(
    "sends %s to the dashboard, not another origin",
    (target) => {
      expect(sameSiteUrl({ origin, target }).href).toBe(
        "https://wovain.com/dashboard"
      );
    }
  );
});

describe("redirectWithin", () => {
  it("answers a 302 to the same-site URL", () => {
    const response = redirectWithin({ origin, target: "//evil.com" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://wovain.com/dashboard"
    );
  });
});
