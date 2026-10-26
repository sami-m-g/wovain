import { describe, expect, it } from "vitest";

import { apiUrl } from "../src/api-url.ts";

const base = "https://gitlab.example/api/v4/projects/42";

describe("apiUrl", () => {
  it("appends the path and query to the base", () => {
    expect(apiUrl(base, "/pipelines?ref=main&per_page=5").href).toBe(
      "https://gitlab.example/api/v4/projects/42/pipelines?ref=main&per_page=5"
    );
  });

  it("keeps an encoded tag name as one path segment", () => {
    expect(
      apiUrl(
        base,
        `/repository/tags/${encodeURIComponent("submission/basics")}`
      ).pathname
    ).toBe("/api/v4/projects/42/repository/tags/submission%2Fbasics");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(apiUrl(`${base}/`, "/releases").pathname).toBe(
      "/api/v4/projects/42/releases"
    );
  });

  it.each([
    "pipelines",
    "@evil.example/x",
    "/../../other",
    "/%2e%2e/%2e%2e/other",
  ])("refuses %s", (path) => {
    expect(() => apiUrl(base, path)).toThrow("outside the API base");
  });
});
