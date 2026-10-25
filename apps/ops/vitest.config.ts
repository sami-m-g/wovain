import { defineConfig } from "vitest/config";

// Pure logic only: signatures, intake and merge guardrails, KPI ranking, SCI
// and the flow definitions. The jobs that call GitLab and Google run in CI.
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
