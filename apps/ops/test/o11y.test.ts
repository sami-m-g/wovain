import { describe, expect, it, vi } from "vitest";

import {
  issueTraceQuery,
  posthogIssueDescription,
  traceIdOf,
  traceUrl,
} from "../src/o11y.ts";
import { createPostHog } from "../src/posthog.ts";

const TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const ISSUE = "0192d6a4-7c39-7d0e-9a35-3f7e2b9c1a01";

describe("traceIdOf", () => {
  it("keeps a W3C trace ID and drops anything else", () => {
    expect(traceIdOf(TRACE)).toBe(TRACE);
    expect(traceIdOf(TRACE.toUpperCase())).toBeUndefined();
    expect(traceIdOf(`${TRACE})[x](https://evil`)).toBeUndefined();
    expect(traceIdOf(null)).toBeUndefined();
    expect(traceIdOf(42)).toBeUndefined();
  });
});

describe("traceUrl", () => {
  it("points at the trace in the group's instance", () => {
    expect(traceUrl("https://144066465.gitlab-o11y.com/", TRACE)).toBe(
      `https://144066465.gitlab-o11y.com/trace/${TRACE}`
    );
  });
});

describe("issueTraceQuery", () => {
  it("reads the newest trace of one issue's exceptions", () => {
    expect(issueTraceQuery(ISSUE)).toContain(
      `properties.$exception_issue_id = '${ISSUE}'`
    );
  });

  it("refuses anything but a UUID", () => {
    expect(() => issueTraceQuery("x' OR 1=1 --")).toThrow();
  });
});

describe("posthogIssueDescription", () => {
  it("names the incident and, when known, the trace", () => {
    const text = posthogIssueDescription({
      incident: "https://gitlab.com/g/p/-/issues/7",
      trace: traceUrl("https://1.gitlab-o11y.com", TRACE),
    });
    expect(text).toContain(
      "GitLab incident: https://gitlab.com/g/p/-/issues/7"
    );
    expect(text).toContain(`/trace/${TRACE}`);
    expect(
      posthogIssueDescription({ incident: "https://gitlab.com/i" })
    ).not.toContain("Trace");
  });
});

describe("createPostHog updateIssue", () => {
  it("patches the error tracking issue", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(Response.json({}))
    );
    const posthog = createPostHog({
      apiKey: "phx_test",
      fetch,
      host: "https://us.posthog.com",
      projectId: "687269",
    });
    await posthog.updateIssue(ISSUE, { description: "d", severity: "high" });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(
      `https://us.posthog.com/api/projects/687269/error_tracking/issues/${ISSUE}/`
    );
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toStrictEqual({
      description: "d",
      severity: "high",
    });
  });
});
