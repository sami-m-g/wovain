import { expect, it } from "vitest";

import { analyticsEnvironment } from "../src/lib/analytics-environment";

it("tags production, qloo and every other host apart", () => {
  for (const host of ["wovain.com", "www.wovain.com", "mcp.wovain.com"]) {
    expect(analyticsEnvironment(host)).toBe("production");
  }
  expect(analyticsEnvironment("qloo.wovain.com")).toBe("qloo");
  expect(analyticsEnvironment("dev.wovain.com")).toBe("development");
  expect(analyticsEnvironment("localhost")).toBe("development");
});
