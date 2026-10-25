import { describe, expect, it, vi } from "vitest";

import { loadKpis } from "../src/kpis.ts";
import {
  createPostHog,
  scalarOf,
  topPagesReport,
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
  it("each take the window and the top pages render as a table", async () => {
    const file = await loadKpis();
    const queries = file.kpis.flatMap((k) =>
      k.source.kind === "posthog" ? [k.source.query] : []
    );
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(withWindow(query, 7)).toContain("INTERVAL 7 DAY");
    }
    expect(file.posthog?.topPages).toContain("{windowDays}");
    expect(topPagesReport([["/", 30, 12]], 7)).toContain("| `/` | 30 | 12 |");
  });
});
