import { Logging } from "@google-cloud/logging";
import { MetricServiceClient, protos } from "@google-cloud/monitoring";

// Production's logs and metrics in Google Cloud. CI signs in through Workload
// Identity Federation (.gcp-auth in .gitlab/ci/templates.yml sets
// GOOGLE_APPLICATION_CREDENTIALS) as a service account that may only read
// logs and metrics. Both clients find those credentials themselves (ADC).

const { Aligner, Reducer } = protos.google.monitoring.v3.Aggregation;
const MAX_ENTRIES = 5000;
const PAGE_SIZE = 1000;

export interface Range {
  start: Date;
  end: Date;
}

// The evlog wide event's fields, unchecked: heal.ts validates each one.
interface ErrorEvent {
  timestamp: string | undefined;
  payload: Record<string, unknown>;
}

const window = (range: Range) =>
  `timestamp>="${range.start.toISOString()}" AND timestamp<"${range.end.toISOString()}"`;

export interface MetricQuery {
  filter: string;
  aligner: string;
  reducer: string;
}

const isAligner = (name: string): name is keyof typeof Aligner =>
  Object.hasOwn(Aligner, name);
const isReducer = (name: string): name is keyof typeof Reducer =>
  Object.hasOwn(Reducer, name);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createGoogle = (project: string) => {
  const logging = new Logging({ projectId: project });
  const monitoring = new MetricServiceClient({ projectId: project });

  // The generated clients sign in on their first call without awaiting it, so
  // bad credentials (a missing GOOGLE_APPLICATION_CREDENTIALS file) become an
  // unhandled rejection that crashes the job. Signing in first, as the clients
  // document for initialize(), turns that into this call's rejection.

  // Up to MAX_ENTRIES entries, newest first; capped says there may be more.
  const entries = async (filter: string, range: Range) => {
    await logging.auth.getClient();
    const [found] = await logging.getEntries({
      filter: `${filter} AND ${window(range)}`,
      maxResults: MAX_ENTRIES,
      orderBy: "timestamp desc",
      pageSize: PAGE_SIZE,
      resourceNames: [`projects/${project}`],
    });
    const events: ErrorEvent[] = found.map((entry) => {
      const { timestamp } = entry.metadata;
      return {
        payload: isRecord(entry.data) ? entry.data : {},
        timestamp:
          timestamp instanceof Date ? timestamp.toISOString() : undefined,
      };
    });
    return { capped: events.length === MAX_ENTRIES, entries: events };
  };

  return {
    entries,
    // One value for the whole range: the metric aligned over the range and
    // reduced across series (a sum, a mean, a percentile).
    metric: async (query: MetricQuery, range: Range): Promise<number> => {
      const { aligner, reducer } = query;
      if (!isAligner(aligner) || !isReducer(reducer)) {
        throw new Error(`Unknown aggregation ${aligner} / ${reducer}`);
      }
      const seconds = Math.max(
        60,
        Math.round((range.end.getTime() - range.start.getTime()) / 1000)
      );
      await monitoring.initialize();
      const [series] = await monitoring.listTimeSeries({
        aggregation: {
          alignmentPeriod: { seconds },
          crossSeriesReducer: reducer,
          perSeriesAligner: aligner,
        },
        filter: query.filter,
        interval: {
          endTime: { seconds: Math.floor(range.end.getTime() / 1000) },
          startTime: { seconds: Math.floor(range.start.getTime() / 1000) },
        },
        name: `projects/${project}`,
      });
      let total = 0;
      for (const timeSeries of series) {
        for (const point of timeSeries.points ?? []) {
          total += Number(
            point.value?.int64Value ?? point.value?.doubleValue ?? 0
          );
        }
      }
      return total;
    },
  };
};
