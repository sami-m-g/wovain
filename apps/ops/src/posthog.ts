import { z } from "zod";

// wovain's product analytics in PostHog, read through its query and alerts
// APIs (posthog.com/docs/api) with a personal API key that has the Query Read
// and Alert Read scopes (and Error Tracking Write, to link an error tracking
// issue to its GitLab incident). The ops jobs use it only when the key and project id
// are set; without them the KPIs that need it fall back or show "no data",
// and the PostHog loop (signals.ts) is off.

const resultSchema = z.object({
  columns: z.array(z.string()).default([]),
  results: z.array(z.array(z.unknown())),
});

const alertSchema = z.object({
  id: z.string(),
  insight: z.object({ short_id: z.string() }).partial().nullish(),
  last_checked_at: z.string().nullish(),
  name: z.string().nullish(),
  // "Firing", "Not firing", "Errored" or "Snoozed".
  state: z.string(),
});
export type Alert = z.infer<typeof alertSchema>;

export interface PostHogQuery {
  // A HogQL query's columns and result rows.
  table: (hogql: string) => Promise<z.infer<typeof resultSchema>>;
  rows: (hogql: string) => Promise<unknown[][]>;
  alerts: () => Promise<Alert[]>;
  // Sets an error tracking issue's description and severity (needs the key's
  // Error Tracking Write scope): o11y.ts links it to its GitLab incident.
  updateIssue: (
    issue: string,
    fields: { description?: string; severity?: "critical" | "high" }
  ) => Promise<void>;
  // The app's link for a path in the project, like "insights/<short id>".
  link: (path: string) => string;
}

export const createPostHog = (options: {
  // The app host, not the ingestion one: https://us.posthog.com.
  host: string;
  projectId: string;
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}): PostHogQuery => {
  const send = options.fetch ?? globalThis.fetch;
  const api = async (path: string, body?: unknown, method = "POST") => {
    const response = await send(
      `${options.host}/api/projects/${options.projectId}/${path}`,
      {
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body), method }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `PostHog ${path} failed: ${response.status} ${await response.text()}`
      );
    }
    return (await response.json()) as unknown;
  };
  const table = async (hogql: string) =>
    resultSchema.parse(
      await api("query/", {
        name: "wovain ops",
        query: { kind: "HogQLQuery", query: hogql },
      })
    );
  return {
    alerts: async () => {
      const { results } = z
        .object({ results: z.array(alertSchema) })
        .parse(await api("alerts/?limit=100"));
      return results;
    },
    link: (path) => `${options.host}/project/${options.projectId}/${path}`,
    rows: async (hogql) => {
      const { results } = await table(hogql);
      return results;
    },
    table,
    updateIssue: async (issue, fields) => {
      await api(
        `error_tracking/issues/${z.uuid().parse(issue)}/`,
        fields,
        "PATCH"
      );
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

// A snapshot section from a query's columns and rows. Cells are numbers or
// our own page paths and flag keys; pipes and backticks are dropped anyway.
export const tableReport = (
  title: string,
  { columns, results }: { columns: string[]; results: unknown[][] }
) =>
  [
    `## ${title} (PostHog)`,
    "",
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...results.map(
      (row) =>
        `| ${row.map((cell) => String(cell).replaceAll(/[|`\n]/gu, " ")).join(" | ")} |`
    ),
  ].join("\n");

// HogQL in kpis.yml says {windowDays} for the measurement window.
export const withWindow = (hogql: string, windowDays: number) =>
  hogql.replaceAll("{windowDays}", String(windowDays));

// Browser exceptions in production over the last `minutes`, one row per
// PostHog error tracking issue, most frequent first; heal.ts's posthogGroupOf
// reads each row.
export const exceptionsQuery = (minutes: number) =>
  `SELECT properties.$exception_issue_id AS issue, any(JSONExtractString(properties.$exception_types, 1)) AS name, any(JSONExtractString(properties.$exception_values, 1)) AS message, any(properties.$pathname) AS path, count() AS events, toString(min(timestamp)) AS first_seen, toString(max(timestamp)) AS last_seen, any(properties.$exception_functions) AS functions, any(properties.$exception_sources) AS sources FROM events WHERE event = '$exception' AND properties.environment = 'production' AND timestamp > now() - INTERVAL ${Math.round(minutes)} MINUTE GROUP BY issue ORDER BY events DESC LIMIT 20`;

// How many times one error tracking issue fired since `since`.
export const issueEventsQuery = (issue: string, since: Date) =>
  `SELECT count() FROM events WHERE event = '$exception' AND properties.$exception_issue_id = '${z.uuid().parse(issue)}' AND timestamp > toDateTime('${since.toISOString().slice(0, 19)}')`;
