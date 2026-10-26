import { createHash } from "node:crypto";

// Platform errors: what Cloud Run itself reports about the web services and
// the app can't log, because it never ran or never saw the request (an out
// of memory kill, a failed startup probe, a crash before evlog loaded, a 5xx
// the platform answered). The ops job forwards each one to PostHog Error
// Tracking as a `$exception`, so self-healing and the release guard watch one
// place (docs/flows.md, "One error sink"). The app's own errors get there
// through evlog's error tracking drain, not through here.

export const PRODUCTION_SERVICE = "wovain-web";
const DEV_SERVICE = "wovain-web-dev";
const SERVICES = `resource.labels.service_name=("${PRODUCTION_SERVICE}" OR "${DEV_SERVICE}")`;

// Cloud Run's request log for 5xx responses, its system log at ERROR and
// above (OOM kills, probe failures, exits) and any unstructured stderr line
// (evlog captures stderr once it has loaded, so these come from before).
export const PLATFORM_FILTER = [
  `resource.type="cloud_run_revision" AND ${SERVICES}`,
  `((log_id("run.googleapis.com/requests") AND httpRequest.status>=500) OR (log_id("run.googleapis.com/varlog/system") AND severity>=ERROR) OR (log_id("run.googleapis.com/stderr") AND textPayload:*))`,
].join(" AND ");

// At most this many entries forwarded a run; the rest wait for the next.
export const MAX_FORWARDED = 200;

const ID_SEGMENT =
  /\/(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{20,})(?=\/|$)/gu;
const SAFE_PATH = /^\/[\w\-./[\]]{0,160}$/u;
const METHODS = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);
const MAX_MESSAGE = 300;
const OOM = /memory limit of .* exceeded/iu;
const STARTUP =
  /startup .*probe failed|container called exit|failed to start|ready condition status changed to false/iu;

export interface LogEntry {
  insertId: string | undefined;
  logName: string | undefined;
  service: string | undefined;
  severity: string | undefined;
  text: string | undefined;
  timestamp: string | undefined;
  httpRequest:
    | {
        requestMethod: string | undefined;
        requestUrl: string | undefined;
        status: number | undefined;
      }
    | undefined;
}

export interface PlatformException {
  // Cloud Logging's id for the entry: what makes forwarding idempotent.
  insertId: string;
  name: string;
  message: string;
  fingerprint: string;
  environment: "development" | "production";
  site: string;
  method: string;
  path: string;
  status: number | undefined;
  timestamp: string | undefined;
}

const hash = (parts: string[]) =>
  createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);

const normalizeMessage = (message: string) =>
  message
    .replaceAll(/\s+/gu, " ")
    .replaceAll("`", "'")
    .trim()
    .slice(0, MAX_MESSAGE);

const pathOf = (url: string | undefined) => {
  if (url === undefined) {
    return "UnknownPath";
  }
  try {
    const { pathname } = new URL(url, "https://wovain.com");
    return SAFE_PATH.test(pathname)
      ? pathname.replaceAll(ID_SEGMENT, "/:id")
      : "UnknownPath";
  } catch {
    return "UnknownPath";
  }
};

const nameOf = (message: string) => {
  if (OOM.test(message)) {
    return "OutOfMemory";
  }
  return STARTUP.test(message) ? "StartupFailure" : "PlatformError";
};

// A log entry as an exception to forward, or undefined when it isn't one.
export const platformExceptionOf = (
  entry: LogEntry
): PlatformException | undefined => {
  if (entry.insertId === undefined) {
    return;
  }
  const production = entry.service === PRODUCTION_SERVICE;
  const where = {
    environment: production
      ? ("production" as const)
      : ("development" as const),
    insertId: entry.insertId,
    site: production ? "wovain.com" : "dev.wovain.com",
    timestamp: entry.timestamp,
  };
  const status = entry.httpRequest?.status;
  if (status !== undefined && status >= 500) {
    const rawMethod = (entry.httpRequest?.requestMethod ?? "").toUpperCase();
    const method = METHODS.has(rawMethod) ? rawMethod : "UNKNOWN";
    const path = pathOf(entry.httpRequest?.requestUrl);
    return {
      ...where,
      fingerprint: hash(["platform", "http", String(status), method, path]),
      message: `Cloud Run answered ${status} on ${method} ${path}`,
      method,
      name: "HttpServerError",
      path,
      status,
    };
  }
  if (entry.text === undefined || entry.text.trim() === "") {
    return;
  }
  const message = normalizeMessage(entry.text);
  const name = nameOf(message);
  return {
    ...where,
    fingerprint: hash([
      "platform",
      name,
      message.replaceAll(/\d+/gu, "<n>").slice(0, 120),
    ]),
    message,
    method: "PLATFORM",
    name,
    path: "/",
    status: undefined,
  };
};

// The entries not forwarded yet, at most MAX_FORWARDED.
export const toForward = (
  entries: LogEntry[],
  forwarded: ReadonlySet<string>
): PlatformException[] =>
  entries
    .flatMap((entry) => platformExceptionOf(entry) ?? [])
    .filter((e) => !forwarded.has(e.insertId))
    .slice(0, MAX_FORWARDED);

// A UUID made from the entry's insert id, so a retried forward is the same
// PostHog event.
export const eventUuidOf = (insertId: string) => {
  const hex = createHash("sha256").update(insertId).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
