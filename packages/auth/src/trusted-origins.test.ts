import { describe, expect, it } from "vitest";

import { trustedOrigins } from "./index";

const env = {
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "https://next.wovain.com",
  MCP_URL: "https://mcp.wovain.com/mcp",
};

describe("trustedOrigins", () => {
  it("trusts the site, the MCP host and the mobile app's scheme", () => {
    expect(trustedOrigins(env, "production")).toEqual([
      "https://next.wovain.com",
      "https://mcp.wovain.com",
      "wovain://",
    ]);
  });

  it("trusts Expo's exp:// only in development", () => {
    expect(trustedOrigins(env, "development")).toContain("exp://");
    expect(trustedOrigins(env, "production")).not.toContain("exp://");
  });
});
