import { expect, it, vi } from "vitest";

// QA 2026-10-29: runs that failed on /api/inngest logged nothing. A run's
// failure is logged with evlog's global `log` (packages/api), outside any
// request, so the global logger must carry the app's drain.
const { drain } = vi.hoisted(() => ({ drain: vi.fn() }));
vi.mock("@/env.server", () => ({ ENV: {} }));
vi.mock("@/lib/analytics", () => ({ captureServerException: vi.fn() }));
vi.mock("evlog/fs", () => ({ createFsDrain: () => drain }));

it("drains an error logged outside a request", async () => {
  await import("@/lib/evlog");
  const { log } = await import("evlog");

  log.error({
    error: { message: "Run failed during research", name: "RunFailed" },
  });

  expect(drain).toHaveBeenCalledWith({
    event: expect.objectContaining({ level: "error", service: "wovain-web" }),
  });
});
