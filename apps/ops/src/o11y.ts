import type { Range } from "./google.ts";
import { normalize, tally } from "./signals.ts";
import type { Signal } from "./signals.ts";

// GitLab Observability, which runs SigNoz: the server's traces arrive over
// OTLP (apps/server/src/telemetry.ts), and its query API takes the group's
// API key in SIGNOZ-API-KEY (docs.gitlab.com, operations/observability/
// api_access). The v5 query shape follows SigNoz's search-traces docs; the
// response is read loosely, since SigNoz documents no response schema.

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

const text = (row: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return "";
};

export const createO11y = (url: string, apiKey: string) => {
  const raw = async (
    range: Range,
    signal: "logs" | "traces",
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
    // Spans with an error status: the MCP request span names the tool, and
    // error.type is the error's class (routes/mcp.ts records only that).
    errors: async (range: Range): Promise<Signal[]> => {
      const [spans, logs] = await Promise.all([
        raw(range, "traces", "service.name = 'wovain' AND has_error = true", [
          "name",
          "mcp.tool",
          "error.type",
        ]),
        raw(
          range,
          "logs",
          "service.name = 'wovain' AND severity_text IN ('ERROR', 'FATAL')",
          ["body"]
        ),
      ]);
      return [
        ...tally(
          "GitLab Observability traces",
          spans.map((row) => {
            const what = [
              text(row, "name"),
              text(row, "mcp.tool"),
              text(row, "error.type"),
            ]
              .filter((part) => part !== "")
              .join(" ");
            return {
              key: `span ${normalize(what)}`,
              sample: what,
              title: `Error span: ${what}`,
            };
          })
        ),
        ...tally(
          "GitLab Observability logs",
          logs.map((row) => {
            const body = text(row, "body");
            return { key: `log ${normalize(body)}`, sample: body, title: body };
          })
        ),
      ];
    },
  };
};
export type O11y = ReturnType<typeof createO11y>;
