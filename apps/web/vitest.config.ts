import { defineConfig } from "vitest/config";

// Unit tests for server-side logic. The heal flow adds its reproduction tests
// here (docs/flows.md). In CI, a JUnit report for GitLab's test report too.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    outputFile: { junit: "junit.xml" },
    reporters:
      process.env["GITLAB_CI"] === undefined
        ? ["default"]
        : ["default", "junit"],
  },
});
