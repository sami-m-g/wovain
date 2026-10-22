import path from "node:path";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Every story runs as a test in Chromium: render, play function and a11y checks.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // In CI, a JUnit report for GitLab's pipeline test report too.
    outputFile: { junit: "junit.xml" },
    projects: [
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(import.meta.dirname, ".storybook"),
          }),
        ],
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
            provider: playwright(),
          },
          name: "storybook",
        },
      },
    ],
    reporters:
      process.env["GITLAB_CI"] === undefined
        ? ["default"]
        : ["default", "junit"],
  },
});
