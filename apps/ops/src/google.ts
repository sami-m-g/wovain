import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

import { normalize, tally } from "./signals.ts";
import type { Signal } from "./signals.ts";

// Production's own logs and metrics in Google Cloud: the App Hosting backend
// is the Cloud Run service "app". CI signs in as gitlab-ops (gitlab-analytics for the weekly job) through Workload
// Identity Federation (.gcp-auth, GOOGLE_APPLICATION_CREDENTIALS), which may
// only read logs and metrics (infra/index.ts).

const SERVICE = "app";
const MAX_PAGES = 5;
const LOGGING = "https://logging.googleapis.com/v2/entries:list";

export interface Range {
  start: Date;
  end: Date;
}

const entrySchema = z.object({
  httpRequest: z
    .object({
      requestMethod: z.string().default(""),
      requestUrl: z.string().default(""),
      status: z.int().optional(),
    })
    .optional(),
  jsonPayload: z.object({ message: z.string().optional() }).optional(),
  textPayload: z.string().optional(),
});
const entriesSchema = z.object({
  entries: z.array(entrySchema).default([]),
  nextPageToken: z.string().optional(),
});

const seriesSchema = z.object({
  timeSeries: z
    .array(
      z.object({
        points: z.array(
          z.object({
            value: z.object({
              doubleValue: z.number().optional(),
              int64Value: z.string().optional(),
            }),
          })
        ),
      })
    )
    .default([]),
});

// A request log names the route; a stderr line names the error class
// (lib/tool-result.ts logs only that).
const entryKey = (entry: z.infer<typeof entrySchema>) => {
  const http = entry.httpRequest;
  if (http?.status !== undefined) {
    const path = new URL(http.requestUrl, "https://x").pathname;
    const route = `${http.requestMethod} ${normalize(path)}`;
    return {
      key: `http ${http.status} ${route}`,
      sample: `${http.status} ${route}`,
      title: `HTTP ${http.status} on ${route}`,
    };
  }
  const text = entry.textPayload ?? entry.jsonPayload?.message ?? "";
  // Stack frames repeat what the first line already says.
  const frame = text.trimStart().startsWith("at ") || text.trim() === "";
  return frame
    ? undefined
    : { key: `log ${normalize(text)}`, sample: text, title: text };
};

export const createGoogle = (project: string) => {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const request = async (url: string, data?: object) => {
    const client = await auth.getClient();
    const response = await client.request({
      method: data === undefined ? "GET" : "POST",
      url,
      ...(data === undefined ? {} : { data }),
    });
    return response.data;
  };

  return {
    // ERROR and worse from the service: 5xx request logs and stderr lines.
    errors: async (range: Range): Promise<Signal[]> => {
      const filter = [
        'resource.type="cloud_run_revision"',
        `resource.labels.service_name="${SERVICE}"`,
        "severity>=ERROR",
        `timestamp>="${range.start.toISOString()}"`,
        `timestamp<"${range.end.toISOString()}"`,
      ].join(" AND ");
      const keys: { key: string; sample: string; title: string }[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const query = {
          filter,
          orderBy: "timestamp desc",
          pageSize: 1000,
          resourceNames: [`projects/${project}`],
          ...(pageToken === undefined ? {} : { pageToken }),
        };
        // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
        const reply = await request(LOGGING, query);
        const body = entriesSchema.parse(reply);
        keys.push(...body.entries.flatMap((entry) => entryKey(entry) ?? []));
        pageToken = body.nextPageToken;
        if (pageToken === undefined) {
          break;
        }
      }
      return tally("Cloud Logging", keys);
    },

    // Sum of a Cloud Run metric over the range, e.g. requests served or
    // billable instance seconds.
    sum: async (metric: string, range: Range): Promise<number> => {
      const seconds = Math.max(
        60,
        Math.round((range.end.getTime() - range.start.getTime()) / 1000)
      );
      const url = new URL(
        `https://monitoring.googleapis.com/v3/projects/${project}/timeSeries`
      );
      for (const [key, value] of Object.entries({
        "aggregation.alignmentPeriod": `${seconds}s`,
        "aggregation.crossSeriesReducer": "REDUCE_SUM",
        "aggregation.perSeriesAligner": "ALIGN_SUM",
        filter: `metric.type="${metric}" AND resource.labels.service_name="${SERVICE}"`,
        "interval.endTime": range.end.toISOString(),
        "interval.startTime": range.start.toISOString(),
      })) {
        url.searchParams.set(key, value);
      }
      const body = seriesSchema.parse(await request(url.toString()));
      let total = 0;
      for (const series of body.timeSeries) {
        for (const point of series.points) {
          total += Number(
            point.value.int64Value ?? point.value.doubleValue ?? 0
          );
        }
      }
      return total;
    },
  };
};
export type Google = ReturnType<typeof createGoogle>;

export const REQUESTS = "run.googleapis.com/request_count";
