import { defineConfig } from "vitest/config";

// Pure logic only: signal grouping, verification and the auto-merge
// guardrails. The CI jobs that call GitLab and Google run on main.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // In CI, a JUnit report for GitLab's pipeline test report too.
    outputFile: { junit: "junit.xml" },
    reporters:
      process.env["GITLAB_CI"] === undefined
        ? ["default"]
        : ["default", "junit"],
  },
});
