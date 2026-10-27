import type { WideEvent } from "evlog";
import { describe, expect, it, vi } from "vitest";

import { createErrorTrackingDrain, exceptionOf } from "@/lib/error-tracking";

// Every server error reaches PostHog Error Tracking through the evlog drain;
// a 4xx doesn't.
const event = (fields: Record<string, unknown>): WideEvent =>
  ({
    environment: "production",
    level: "error",
    service: "wovain-web",
    timestamp: "2026-10-26T12:00:00.000Z",
    ...fields,
  }) as WideEvent;

const metaFault = (userId: string) =>
  exceptionOf(
    event({
      error: {
        code: "META_NOT_CONFIGURED",
        message: "meta isn't configured on this server",
        name: "EvlogError",
        status: 503,
      },
      method: "GET",
      path: "/api/connections/meta/start",
      status: 302,
      userId,
    })
  );

const fingerprintFor = (message: string) =>
  exceptionOf(event({ error: { message, name: "TypeError" } }))?.properties[
    "$exception_fingerprint"
  ];

describe("server error tracking", () => {
  it("reports a typed config fault on a redirecting route with a stable fingerprint", () => {
    const first = metaFault("user_1");
    expect(first?.error.name).toBe("EvlogError");
    expect(first?.distinctId).toBe("user_1");
    expect(first?.properties).toMatchObject({
      code: "META_NOT_CONFIGURED",
      error_source: "server",
      status: 503,
    });
    expect(first?.properties["$exception_fingerprint"]).toBe(
      metaFault("user_2")?.properties["$exception_fingerprint"]
    );
  });

  it("reports a Better Auth or email failure logged on the global logger", () => {
    const exception = exceptionOf(
      event({
        email: { kind: "verify" },
        error: { message: "Resend rejected the API key", name: "EmailError" },
      })
    );
    expect(exception?.error.message).toBe("Resend rejected the API key");
    expect(exception?.error.name).toBe("EmailError");
  });

  it("reports a plain-text stderr line evlog captured", () => {
    const exception = exceptionOf(
      event({
        message: "DETECTED LEAKED SENSITIVE CONFIG",
        source: "stderr",
      })
    );
    expect(exception?.error.name).toBe("ConsoleError");
    expect(exception?.error.message).toBe("DETECTED LEAKED SENSITIVE CONFIG");
  });

  it("carries the wide event's trace ID", () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
    const exception = exceptionOf(
      event({ error: { message: "boom", name: "TypeError" }, traceId })
    );
    expect(exception?.properties["trace_id"]).toBe(traceId);
  });

  it("groups uncoded errors by message without numbers", () => {
    expect(fingerprintFor("row 12 missing")).toBe(
      fingerprintFor("row 345 missing")
    );
    expect(fingerprintFor("row 12 missing")).not.toBe(
      fingerprintFor("column 12 missing")
    );
  });

  it.each([
    ["a 401", { error: { message: "no", status: 401 } }],
    ["a 404 response", { error: { message: "gone" }, status: 404 }],
    ["an info event", { level: "info", status: 200 }],
  ])("doesn't report %s", (_name, fields) => {
    expect(exceptionOf(event(fields))).toBeUndefined();
  });

  it("sends each exception through the capture function", async () => {
    const capture = vi.fn(() => Promise.resolve());
    await createErrorTrackingDrain(capture)({
      event: event({ error: { message: "boom", name: "Error" } }),
    });
    expect(capture).toHaveBeenCalledOnce();
  });
});
