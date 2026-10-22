import type { Range } from "./google.ts";
import { tally } from "./signals.ts";
import type { Signal } from "./signals.ts";

// GitLab Observability, which runs SigNoz: the server's traces arrive over
// OTLP (apps/server/src/telemetry.ts), and its query API takes the group's
// API key in SIGNOZ-API-KEY (docs.gitlab.com, operations/observability/
// api_access). The v5 query shape follows SigNoz's search-traces docs; the
// response is read loosely, since SigNoz documents no response schema.
//
// The OTLP endpoint takes anyone's data until token enforcement is on
// (docs/transcend.md), so resource attributes here prove nothing. The scout
// reads no text from it: only the error.type and status of the server's own
// mcp.request span, each checked against an allowlist, and a problem only
// GitLab Observability saw goes to a human, never to Duo (signals.ts).

const LIMIT = 500;

// Every row object in a v5 raw response, wherever SigNoz nests them.
const rowsOf = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap(rowsOf);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record: Record<string, unknown> = { ...value };
  if (Array.isArray(record["rows"])) {
    return record["rows"].flatMap((row: unknown) => {
      if (typeof row !== "object" || row === null) {
        return [];
      }
      const fields: Record<string, unknown> = { ...row };
      const data = fields["data"] ?? row;
      return typeof data === "object" && data !== null ? [{ ...data }] : [];
    });
  }
  return Object.values(record).flatMap(rowsOf);
};

export const createO11y = (url: string, apiKey: string) => {
  const raw = async (
    range: Range,
    signal: "traces",
    expression: string,
    fields: string[]
  ) => {
    const response = await fetch(`${url}/api/v5/query_range`, {
      body: JSON.stringify({
        compositeQuery: {
          queries: [
            {
              spec: {
                disabled: false,
                filter: { expression },
                limit: LIMIT,
                name: "A",
                selectFields: fields.map((name) => ({ name })),
                signal,
              },
              type: "builder_query",
            },
          ],
        },
        end: range.end.getTime(),
        requestType: "raw",
        start: range.start.getTime(),
        variables: {},
      }),
      headers: {
        "SIGNOZ-API-KEY": apiKey,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Observability ${signal} query: ${response.status}`);
    }
    return rowsOf(await response.json());
  };

  return {
    // Error spans from the server's mcp.request span (routes/mcp.ts), which
    // only /mcp records. error.type is set when the handler threw, and Hono
    // then answers 500.
    errors: async (range: Range): Promise<Signal[]> => {
      const spans = await raw(
        range,
        "traces",
        "service.name = 'wovain' AND deployment.environment.name = 'production' AND name = 'mcp.request' AND has_error = true",
        ["name", "error.type", "http.response.status_code"]
      );
      return tally(
        "GitLab Observability traces",
        spans.map((row) => ({
          errorClass: row["error.type"],
          route: row["name"] === "mcp.request" ? "ALL /mcp" : undefined,
          status: Number(row["http.response.status_code"] ?? 500),
        }))
      );
    },
  };
};
export type O11y = ReturnType<typeof createO11y>;
