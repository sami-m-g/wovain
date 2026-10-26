import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests for server-side logic. The heal flow adds its reproduction tests
// here (docs/flows.md). In CI, a JUnit report for GitLab's test report too.
// Component tests render to static markup (react-dom/server), no DOM needed.
export default defineConfig({
  // The app's `@/` imports (tsconfig.json paths), for modules under test.
  resolve: { alias: { "@": fileURLToPath(new URL("src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    outputFile: { junit: "junit.xml" },
    reporters:
      process.env["GITLAB_CI"] === undefined
        ? ["default"]
        : ["default", "junit"],
  },
});
