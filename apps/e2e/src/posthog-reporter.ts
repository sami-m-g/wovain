import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { PostHog } from "posthog-node";

// Sends each smoke test that finally failed to PostHog Error Tracking, the
// one place errors are watched (AGENTS.md), as an exception on the
// environment's own project. On only when E2E_POSTHOG_KEY is set
// (nightly-e2e.yml: next's project token).
export default class PostHogReporter implements Reporter {
  private readonly posthog = process.env["E2E_POSTHOG_KEY"]
    ? new PostHog(process.env["E2E_POSTHOG_KEY"], {
        host: process.env["E2E_POSTHOG_HOST"] ?? "https://us.i.posthog.com",
      })
    : undefined;

  onTestEnd(test: TestCase, result: TestResult) {
    const final = result.retry === test.retries || result.status === "passed";
    if (!final || test.outcome() !== "unexpected") {
      return;
    }
    const error = new Error(
      `Smoke test failed: ${test.title}: ${result.error?.message ?? result.status}`
    );
    error.name = "SmokeTestFailed";
    if (result.error?.stack !== undefined) {
      error.stack = result.error.stack;
    }
    this.posthog?.captureException(error, "e2e-smoke", {
      site: process.env["E2E_BASE_URL"],
      test: test.titlePath().join(" › "),
    });
  }

  async onEnd() {
    await this.posthog?.shutdown();
  }
}
