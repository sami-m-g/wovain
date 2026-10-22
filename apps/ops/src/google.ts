import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

import { tally } from "./signals.ts";
import type { Signal } from "./signals.ts";

// Production's own logs and metrics in Google Cloud: the App Hosting backend
// is the Cloud Run service "app". CI signs in as gitlab-ops (gitlab-analytics for the weekly job) through Workload
// Identity Federation (.gcp-auth, GOOGLE_APPLICATION_CREDENTIALS), which may
// only read logs and metrics (infra/index.ts).

const SERVICE = "app";
const LOCATION = "us-central1";
const MAX_PAGES = 5;
const LOGGING = "https://logging.googleapis.com/v2/entries:list";

export interface Range {
  start: Date;
  end: Date;
}

// Only the structured fields apps/server/src/lib/request-errors.ts writes;
// each is checked against an allowlist in signals.ts. The message, the
// request URL and every other free-text field are never read.
const entrySchema = z.object({
  jsonPayload: z
    .object({
      wovain: z
        .object({
          errorClass: z.unknown(),
          route: z.unknown(),
          status: z.unknown(),
        })
        .optional(),
    })
    .optional(),
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
    // The service's own structured error lines. The resource labels are set
    // by Cloud Run, not by whoever sent a request, and only the service's
    // stdout and stderr logs are read: the request log carries raw URLs.
    errors: async (range: Range): Promise<Signal[]> => {
      const filter = [
        'resource.type="cloud_run_revision"',
        `resource.labels.project_id="${project}"`,
        `resource.labels.location="${LOCATION}"`,
        `resource.labels.service_name="${SERVICE}"`,
        `resource.labels.configuration_name="${SERVICE}"`,
        `resource.labels.revision_name=~"^${SERVICE}-"`,
        `(logName="projects/${project}/logs/run.googleapis.com%2Fstderr" OR logName="projects/${project}/logs/run.googleapis.com%2Fstdout")`,
        "severity>=ERROR",
        "jsonPayload.wovain.errorClass:*",
        `timestamp>="${range.start.toISOString()}"`,
        `timestamp<"${range.end.toISOString()}"`,
      ].join(" AND ");
      const fields: { errorClass: unknown; route: unknown; status: unknown }[] =
        [];
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
        fields.push(
          ...body.entries.flatMap((entry) => entry.jsonPayload?.wovain ?? [])
        );
        pageToken = body.nextPageToken;
        if (pageToken === undefined) {
          break;
        }
      }
      return tally("Cloud Logging", fields);
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
        filter: [
          `metric.type="${metric}"`,
          'resource.type="cloud_run_revision"',
          `resource.labels.location="${LOCATION}"`,
          `resource.labels.service_name="${SERVICE}"`,
          `resource.labels.configuration_name="${SERVICE}"`,
        ].join(" AND "),
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
