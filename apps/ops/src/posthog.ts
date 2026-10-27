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

// Exceptions from production and dev.wovain.com (which runs the same code and
// the fault-injection flag), never from a laptop: server exceptions carry
// `site`, the browser's `$host`.
const WATCHED = `(properties.environment = 'production' OR coalesce(properties.site, properties.$host) = 'dev.wovain.com')`;
const sinceMinutes = (minutes: number) =>
  `timestamp > now() - INTERVAL ${Math.round(minutes)} MINUTE`;

// Every exception over the last `minutes` (server, browser, platform and
// smoke: PostHog Error Tracking is the one error sink), one row per error
// tracking issue, most frequent first; heal.ts's posthogGroupOf reads each
// row.
export const exceptionsQuery = (minutes: number) =>
  `SELECT properties.$exception_issue_id AS issue, any(JSONExtractString(properties.$exception_types, 1)) AS name, any(JSONExtractString(properties.$exception_values, 1)) AS message, any(coalesce(properties.$pathname, properties.path)) AS path, count() AS events, toString(min(timestamp)) AS first_seen, toString(max(timestamp)) AS last_seen, any(properties.$exception_functions) AS functions, any(properties.$exception_sources) AS sources, any(properties.method) AS method, any(coalesce(properties.error_source, '')) AS source, any(properties.status) AS status FROM events WHERE event = '$exception' AND ${WATCHED} AND ${sinceMinutes(minutes)} GROUP BY issue ORDER BY events DESC LIMIT 20`;

// Exception counts over the last `minutes` by where (production or dev) and
// source (server, platform, smoke or browser), for the release guard and the
// status page.
export const exceptionCountsQuery = (minutes: number) =>
  `SELECT if(properties.environment = 'production', 'production', 'dev') AS env, coalesce(properties.error_source, 'browser') AS source, count() AS events FROM events WHERE event = '$exception' AND ${WATCHED} AND ${sinceMinutes(minutes)} GROUP BY env, source`;

export interface ExceptionCounts {
  // Server and platform exceptions: the server side of production.
  production: number;
  dev: number;
  browser: number;
  smoke: number;
}

export const exceptionCountsOf = (rows: unknown[][]): ExceptionCounts => {
  const counts = { browser: 0, dev: 0, production: 0, smoke: 0 };
  for (const [env, source, events] of rows) {
    const n = Number(events) || 0;
    if (source === "browser") {
      counts.browser += env === "production" ? n : 0;
    } else if (source === "smoke") {
      counts.smoke += n;
    } else if (env === "production") {
      counts.production += n;
    } else {
      counts.dev += n;
    }
  }
  return counts;
};

// Cloud Logging entries the ops job already forwarded as platform
// exceptions, by insert id, so a rerun doesn't send them twice.
export const forwardedQuery = (minutes: number) =>
  `SELECT DISTINCT properties.log_insert_id FROM events WHERE event = '$exception' AND properties.error_source = 'platform' AND ${sinceMinutes(minutes)} LIMIT 10000`;

// How many times one error tracking issue fired since `since`.
export const issueEventsQuery = (issue: string, since: Date) =>
  `SELECT count() FROM events WHERE event = '$exception' AND properties.$exception_issue_id = '${z.uuid().parse(issue)}' AND timestamp > toDateTime('${since.toISOString().slice(0, 19)}')`;
