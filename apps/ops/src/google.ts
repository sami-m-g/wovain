import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

// Production's logs and metrics in Google Cloud. CI signs in through Workload
// Identity Federation (.gcp-auth in .gitlab/ci/templates.yml sets
// GOOGLE_APPLICATION_CREDENTIALS) as a service account that may only read
// logs and metrics.

const LOGGING = "https://logging.googleapis.com/v2/entries:list";
const MONITORING = "https://monitoring.googleapis.com/v3/projects";
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

export interface Range {
  start: Date;
  end: Date;
}

// The evlog wide event's fields, unchecked: heal.ts validates each one.
interface ErrorEvent {
  timestamp: string | undefined;
  payload: Record<string, unknown>;
}

const entriesSchema = z.object({
  entries: z
    .array(
      z.object({
        jsonPayload: z.record(z.string(), z.unknown()).optional(),
        timestamp: z.string().optional(),
      })
    )
    .default([]),
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

const window = (range: Range) =>
  `timestamp>="${range.start.toISOString()}" AND timestamp<"${range.end.toISOString()}"`;

export interface MetricQuery {
  filter: string;
  aligner: string;
  reducer: string;
}

export const createGoogle = (project: string) => {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const request = async (url: string, data?: object): Promise<unknown> => {
    const client = await auth.getClient();
    const response = await client.request({
      method: data === undefined ? "GET" : "POST",
      url,
      ...(data === undefined ? {} : { data }),
    });
    return response.data;
  };

  // Up to MAX_PAGES pages of entries, newest first; capped says there were more.
  const entries = async (filter: string, range: Range) => {
    const found: ErrorEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = {
        filter: `${filter} AND ${window(range)}`,
        orderBy: "timestamp desc",
        pageSize: PAGE_SIZE,
        resourceNames: [`projects/${project}`],
        ...(pageToken === undefined ? {} : { pageToken }),
      };
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
      const reply = await request(LOGGING, query);
      const body = entriesSchema.parse(reply);
      found.push(
        ...body.entries.map((e) => ({
          payload: e.jsonPayload ?? {},
          timestamp: e.timestamp,
        }))
      );
      pageToken = body.nextPageToken;
      if (pageToken === undefined) {
        return { capped: false, entries: found };
      }
    }
    return { capped: true, entries: found };
  };

  return {
    entries,
    // One value for the whole range: the metric aligned over the range and
    // reduced across series (a sum, a mean, a percentile).
    metric: async (query: MetricQuery, range: Range): Promise<number> => {
      const seconds = Math.max(
        60,
        Math.round((range.end.getTime() - range.start.getTime()) / 1000)
      );
      const url = new URL(`${MONITORING}/${project}/timeSeries`);
      for (const [key, value] of Object.entries({
        "aggregation.alignmentPeriod": `${seconds}s`,
        "aggregation.crossSeriesReducer": query.reducer,
        "aggregation.perSeriesAligner": query.aligner,
        filter: query.filter,
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
