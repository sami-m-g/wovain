import { describe, expect, it } from "vitest";

import {
  MAX_FORWARDED,
  eventUuidOf,
  platformExceptionOf,
  toForward,
} from "../src/platform.ts";
import type { LogEntry } from "../src/platform.ts";
import { exceptionCountsOf } from "../src/posthog.ts";

// Cloud Run's own errors become PostHog exceptions with stable fingerprints,
// each entry once.
const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  httpRequest: undefined,
  insertId: "abc123",
  logName: "projects/p/logs/run.googleapis.com%2Fvarlog%2Fsystem",
  service: "wovain-web",
  severity: "ERROR",
  text: undefined,
  timestamp: "2026-10-26T12:00:00Z",
  ...overrides,
});
const request = (status: number, url: string, insertId = "r1") =>
  entry({
    httpRequest: { requestMethod: "POST", requestUrl: url, status },
    insertId,
  });

describe("platformExceptionOf", () => {
  it("groups a 5xx the platform answered by status and route", () => {
    const a = platformExceptionOf(
      request(500, "https://wovain.com/api/auth/sign-in/email?x=1")
    );
    expect(a).toMatchObject({
      environment: "production",
      method: "POST",
      name: "HttpServerError",
      path: "/api/auth/sign-in/email",
      site: "wovain.com",
      status: 500,
    });
    expect(
      platformExceptionOf(
        request(500, "https://wovain.com/api/auth/sign-in/email", "r2")
      )?.fingerprint
    ).toBe(a?.fingerprint);
  });

  it("names an OOM kill and a failed startup, and tells dev from production", () => {
    expect(
      platformExceptionOf(
        entry({
          service: "wovain-web-dev",
          text: "Memory limit of 512 MiB exceeded with 530 MiB used.",
        })
      )
    ).toMatchObject({
      environment: "development",
      name: "OutOfMemory",
      site: "dev.wovain.com",
    });
    expect(
      platformExceptionOf(
        entry({ text: "Default STARTUP TCP probe failed 1 time consecutively" })
      )?.name
    ).toBe("StartupFailure");
  });

  it("skips entries without an id or text", () => {
    expect(platformExceptionOf(entry({ insertId: undefined }))).toBeUndefined();
    expect(platformExceptionOf(entry({ text: "  " }))).toBeUndefined();
  });
});

describe("toForward", () => {
  it("leaves out what was forwarded and caps a run", () => {
    const many = Array.from({ length: MAX_FORWARDED + 5 }, (_, i) =>
      request(503, "https://wovain.com/", `id${i}`)
    );
    expect(toForward(many, new Set(["id0"]))).toHaveLength(MAX_FORWARDED);
    expect(toForward(many.slice(0, 2), new Set(["id0"]))).toHaveLength(1);
  });

  it("makes the same UUID for the same entry", () => {
    expect(eventUuidOf("x")).toBe(eventUuidOf("x"));
    expect(eventUuidOf("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });
});

describe("exceptionCountsOf", () => {
  it("splits production's server side, dev, the browser and smoke", () => {
    expect(
      exceptionCountsOf([
        ["production", "server", "4"],
        ["production", "platform", "2"],
        ["dev", "server", "7"],
        ["production", "browser", "3"],
        ["dev", "browser", "9"],
        ["production", "smoke", "1"],
      ])
    ).toStrictEqual({ browser: 3, dev: 7, production: 6, smoke: 1 });
  });
});
