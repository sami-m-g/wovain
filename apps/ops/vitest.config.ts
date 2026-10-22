import { defineConfig } from "vitest/config";

// Pure logic only: signal grouping, verification and the auto-merge
// guardrails. The CI jobs that call GitLab and Google run on main.
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
