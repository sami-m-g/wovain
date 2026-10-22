import { createHash } from "node:crypto";

// One kind of production error the scout saw, from one source. Every field
// is server-controlled or allowlisted: log and telemetry text can carry what
// a caller sent (an error message, a URL, a header), and the scout's issues
// go to the Duo Developer flow, so free text never enters them.
export type Source = "Cloud Logging" | "GitLab Observability traces";

export interface Signal {
  count: number;
  errorClass: string;
  route: string;
  status: number | undefined;
  source: Source;
}

// The scout's grouped view: one problem, every source that saw it.
export interface Problem {
  count: number;
  errorClass: string;
  fingerprint: string;
  route: string;
  status: number | undefined;
  sources: Source[];
}

export const UNKNOWN_ERROR = "UnknownError";
export const UNKNOWN_ROUTE = "UnknownRoute";

// Error class names the server, its SDKs and Node throw. Anything else is
// reported as UnknownError and goes to a human.
const ERROR_CLASSES = new Set([
  "AbortError",
  "AggregateError",
  "Error",
  "FirebaseAppError",
  "FirebaseError",
  "GaxiosError",
  "GenkitError",
  "HTTPException",
  "McpError",
  "NotFoundException",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
  "ZodError",
]);

// The routes the server registers (apps/server/src/app.ts and routes/), as
// lib/request-errors.ts logs them: the method Hono registered and its
// pattern. Anything else is UnknownRoute and goes to a human.
const ROUTES = new Set([
  "ALL /mcp",
  "GET /",
  "GET /.well-known/oauth-protected-resource",
  "GET /.well-known/oauth-protected-resource/mcp",
  "GET /confirm/:ticket",
  "GET /confirm/callback",
  "GET /confirm/launch/:id",
  "GET /connect/:provider",
  "GET /data-deletion",
  "GET /oauth/callback/:provider",
  "GET /oauth/callback/wovain",
  "GET /oauth/client.json",
  "GET /privacy",
  "POST /confirm",
  "POST /confirm/launch/:id",
]);

const errorClassOf = (value: unknown) =>
  typeof value === "string" && ERROR_CLASSES.has(value) ? value : UNKNOWN_ERROR;

const routeOf = (value: unknown) =>
  typeof value === "string" && ROUTES.has(value) ? value : UNKNOWN_ROUTE;

const statusOf = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 100 &&
  value <= 599
    ? value
    : undefined;

const keyOf = (s: Omit<Signal, "count" | "source">) =>
  `${s.errorClass} ${s.route} ${s.status ?? "-"}`;

const fingerprintOf = (s: Omit<Signal, "count" | "source">) =>
  `fp-${createHash("sha256").update(keyOf(s)).digest("hex").slice(0, 10)}`;

// Counts raw fields by kind; each field passes its allowlist first, so
// nothing else from the entry survives.
export const tally = (
  source: Source,
  entries: { errorClass: unknown; route: unknown; status: unknown }[]
): Signal[] => {
  const byKey = new Map<string, Signal>();
  for (const entry of entries) {
    const signal: Signal = {
      count: 1,
      errorClass: errorClassOf(entry.errorClass),
      route: routeOf(entry.route),
      source,
      status: statusOf(entry.status),
    };
    const seen = byKey.get(keyOf(signal));
    if (seen === undefined) {
      byKey.set(keyOf(signal), signal);
    } else {
      seen.count += 1;
    }
  }
  return [...byKey.values()];
};

// Merges signals of the same kind across sources, biggest first.
export const groupSignals = (signals: Signal[]): Problem[] => {
  const byKey = new Map<string, Problem>();
  for (const signal of signals) {
    const fingerprint = fingerprintOf(signal);
    const problem = byKey.get(fingerprint) ?? {
      count: 0,
      errorClass: signal.errorClass,
      fingerprint,
      route: signal.route,
      sources: [],
      status: signal.status,
    };
    problem.count += signal.count;
    if (!problem.sources.includes(signal.source)) {
      problem.sources.push(signal.source);
    }
    byKey.set(fingerprint, problem);
  }
  return [...byKey.values()].toSorted((a, b) => b.count - a.count);
};

// Why a problem stays with a human instead of the Duo Developer flow. Only a
// known class on a known route that Cloud Logging saw goes to Duo: only the
// service writes its logs, while GitLab Observability's OTLP endpoint takes
// anyone's data until token enforcement is on (docs/transcend.md).
export const humanReasons = (problem: Problem): string[] => [
  ...(problem.errorClass === UNKNOWN_ERROR
    ? ["the error class isn't on the scout's allowlist"]
    : []),
  ...(problem.route === UNKNOWN_ROUTE
    ? ["the route isn't one the server registers"]
    : []),
  ...(problem.sources.includes("Cloud Logging")
    ? []
    : ["no Cloud Logging entry corroborates it"]),
];

// The issue title, from allowlisted fields only.
export const titleOf = (problem: Problem) =>
  `scout: ${problem.errorClass} on ${problem.route} (${problem.status ?? "no status"})`;

// Web text for the market scout (analysis.ts) is untrusted: it's redacted
// and clipped before it reaches an issue.
const SAMPLE_MAX = 300;

const clip = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

// Anything that could be a credential or a person: bearer tokens, key=value
// secrets, emails, JWTs and long opaque strings.
const SECRETS: [RegExp, string][] = [
  [/bearer\s+[\w.~+/-]+=*/giu, "Bearer [redacted]"],
  [
    /\b(?<name>[\w-]*(?:key|token|secret|password|authorization)[\w-]*)(?<sep>["']?\s*[:=]\s*["']?)[^\s"',;&]+/giu,
    "$<name>$<sep>[redacted]",
  ],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/gu, "[email]"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/gu, "[jwt]"],
  [/\b[A-Za-z0-9_\-+/]{32,}={0,2}/gu, "[redacted]"],
];

export const redact = (text: string) => {
  let out = text;
  for (const [pattern, to] of SECRETS) {
    out = out.replace(pattern, to);
  }
  return clip(out, SAMPLE_MAX);
};

export type Verdict = "regressed" | "verified" | "wait";

// Whether a merged fix worked, from the problem's errors per request before
// the merge and since the deploy. It waits for MIN_HOURS and MIN_REQUESTS of
// traffic, so an idle service never counts as fixed.
const MIN_HOURS = 2;
const GIVE_UP_HOURS = 24;
const MIN_REQUESTS = 5;
const DROP = 0.2;

export interface Window {
  errors: number;
  requests: number;
}

const rate = (w: Window) => w.errors / Math.max(w.requests, 1);

export const decideVerification = (input: {
  hoursSinceDeploy: number;
  before: Window;
  after: Window;
}): Verdict => {
  const { after, before, hoursSinceDeploy } = input;
  if (hoursSinceDeploy < MIN_HOURS || after.requests < MIN_REQUESTS) {
    return "wait";
  }
  if (after.errors === 0 || rate(after) <= rate(before) * DROP) {
    return "verified";
  }
  return hoursSinceDeploy >= GIVE_UP_HOURS ? "regressed" : "wait";
};
