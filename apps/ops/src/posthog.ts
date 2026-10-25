import { z } from "zod";

// wovain's product analytics in PostHog, read through its query API
// (posthog.com/docs/api/queries) with a personal API key that has the Query
// Read scope. scout-collect.ts uses it only when the key and project id are
// set; without them the KPIs that need it fall back or show "no data".

const resultSchema = z.object({
  results: z.array(z.array(z.unknown())),
});

export interface PostHogQuery {
  // A HogQL query's result rows.
  rows: (hogql: string) => Promise<unknown[][]>;
}

export const createPostHog = (options: {
  // The app host, not the ingestion one: https://us.posthog.com.
  host: string;
  projectId: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}): PostHogQuery => {
  const send = options.fetch ?? globalThis.fetch;
  return {
    rows: async (hogql) => {
      const response = await send(
        `${options.host}/api/projects/${options.projectId}/query/`,
        {
          body: JSON.stringify({
            name: "wovain scout",
            query: { kind: "HogQLQuery", query: hogql },
          }),
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error(
          `PostHog query failed: ${response.status} ${await response.text()}`
        );
      }
      return resultSchema.parse(await response.json()).results;
    },
  };
};

// The query's first column of its first row, as a KPI value; a null (no
// visitors to divide by) is no data.
export const scalarOf = (rows: unknown[][]): number | undefined => {
  const value = rows[0]?.[0];
  if (value === null || value === undefined) {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

// The snapshot's top pages section, from (page, views, visitors) rows.
export const topPagesReport = (rows: unknown[][], windowDays: number) =>
  [
    `## Top pages (PostHog, last ${windowDays} days)`,
    "",
    "| Page | Views | Visitors |",
    "| --- | --- | --- |",
    ...rows.map(
      ([page, views, visitors]) =>
        `| \`${String(page)}\` | ${String(views)} | ${String(visitors)} |`
    ),
  ].join("\n");

// HogQL in kpis.yml says {windowDays} for the measurement window.
export const withWindow = (hogql: string, windowDays: number) =>
  hogql.replaceAll("{windowDays}", String(windowDays));
