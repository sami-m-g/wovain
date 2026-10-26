import { describe, expect, it, vi } from "vitest";

import { loadKpis } from "../src/kpis.ts";
import {
  createPostHog,
  issueEventsQuery,
  scalarOf,
  tableReport,
  withWindow,
} from "../src/posthog.ts";

describe("createPostHog", () => {
  it("posts HogQL to the project's query API with the personal key", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(Response.json({ results: [[42]] }))
    );
    const posthog = createPostHog({
      apiKey: "phx_test",
      fetch,
      host: "https://us.posthog.com",
      projectId: "687269",
    });
    await expect(posthog.rows("SELECT 42")).resolves.toStrictEqual([[42]]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://us.posthog.com/api/projects/687269/query/");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer phx_test" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      query: { kind: "HogQLQuery", query: "SELECT 42" },
    });
  });

  it("fails loudly on an API error", async () => {
    const posthog = createPostHog({
      apiKey: "bad",
      fetch: () =>
        Promise.resolve(new Response("invalid key", { status: 401 })),
      host: "https://us.posthog.com",
      projectId: "1",
    });
    await expect(posthog.rows("SELECT 1")).rejects.toThrow(/401/u);
  });
});

describe("scalarOf", () => {
  it("reads the first cell, with null or nothing as no data", () => {
    expect(scalarOf([[0.25]])).toBe(0.25);
    expect(scalarOf([["12"]])).toBe(12);
    expect(scalarOf([[null]])).toBeUndefined();
    expect(scalarOf([])).toBeUndefined();
  });
});

describe("the KPI file's PostHog queries", () => {
  it("each take the window and name the value the KPI alerts read", async () => {
    const file = await loadKpis();
    // These two define their own windows (a matured cohort, the last 24 hours).
    const fixedWindow = new Set(["activation-cohort", "run-success-rate"]);
    const posthogKpis = file.kpis.flatMap((k) =>
      k.source.kind === "posthog" ? [{ id: k.id, query: k.source.query }] : []
    );
    expect(posthogKpis.length).toBeGreaterThan(0);
    for (const { id, query } of posthogKpis) {
      if (!fixedWindow.has(id)) {
        expect(withWindow(query, 7)).toContain("INTERVAL 7 DAY");
      }
      expect(query).toContain(" AS value ");
    }
    for (const { query } of file.posthog?.context ?? []) {
      expect(query).toContain("{windowDays}");
    }
  });

  it("render context as a table without breaking the markdown", () => {
    expect(
      tableReport("Top pages", {
        columns: ["page", "views"],
        results: [["/a|b", 30]],
      })
    ).toContain("| /a b | 30 |");
  });
});

describe("issueEventsQuery", () => {
  it("only takes an issue id that is a UUID", () => {
    const since = new Date("2026-10-25T12:00:00Z");
    expect(
      issueEventsQuery("0192d6a6-0b6e-7f00-8a1b-3c4d5e6f7a8b", since)
    ).toContain("toDateTime('2026-10-25T12:00:00')");
    expect(() => issueEventsQuery("x' OR 1=1 --", since)).toThrow();
  });
});

describe("alerts", () => {
  it("lists the project's alerts with their state", async () => {
    const posthog = createPostHog({
      apiKey: "phx_test",
      fetch: () =>
        Promise.resolve(
          Response.json({
            results: [{ id: "a1", name: "kpi:client-errors", state: "Firing" }],
          })
        ),
      host: "https://us.posthog.com",
      projectId: "687269",
    });
    await expect(posthog.alerts()).resolves.toMatchObject([
      { name: "kpi:client-errors", state: "Firing" },
    ]);
    expect(posthog.link("insights/abc")).toBe(
      "https://us.posthog.com/project/687269/insights/abc"
    );
  });
});
