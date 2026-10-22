import { createHash } from "node:crypto";

// One kind of production error the scout saw, from one source. Samples are
// untrusted text (log lines can carry what a caller sent), so they are
// redacted and clipped before they reach an issue.
export interface Signal {
  count: number;
  // Stable across runs: the same error gets the same key.
  key: string;
  sample: string;
  source: string;
  title: string;
}

// The scout's grouped view: one problem, every source that saw it.
export interface Problem {
  count: number;
  fingerprint: string;
  samples: string[];
  sources: string[];
  title: string;
}

const SAMPLE_MAX = 300;
const TITLE_MAX = 80;

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

// Strips what changes between occurrences of the same error (ids, numbers,
// quoted values, query strings) so they group under one key.
export const normalize = (text: string) =>
  (text.split("\n")[0] ?? "")
    .replaceAll(/\?[^\s]*/gu, "")
    .replaceAll(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu,
      ":id"
    )
    .replaceAll(/\b[0-9a-f]{12,}\b/giu, ":id")
    .replaceAll(/(?<quote>["'`]).*?\k<quote>/gu, ":str")
    .replaceAll(/\d+/gu, ":n")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .toLowerCase();

const fingerprintOf = (key: string) =>
  `fp-${createHash("sha256").update(key).digest("hex").slice(0, 10)}`;

// Merges signals with the same key across sources, biggest first.
export const groupSignals = (signals: Signal[]): Problem[] => {
  const byKey = new Map<string, Problem>();
  for (const signal of signals) {
    const fingerprint = fingerprintOf(signal.key);
    const problem = byKey.get(fingerprint) ?? {
      count: 0,
      fingerprint,
      samples: [],
      sources: [],
      title: clip(signal.title, TITLE_MAX),
    };
    problem.count += signal.count;
    if (!problem.sources.includes(signal.source)) {
      problem.sources.push(signal.source);
    }
    const sample = redact(signal.sample);
    if (problem.samples.length < 3 && !problem.samples.includes(sample)) {
      problem.samples.push(sample);
    }
    byKey.set(fingerprint, problem);
  }
  return [...byKey.values()].toSorted((a, b) => b.count - a.count);
};

// Counts occurrences by key, keeping the first sample of each.
export const tally = (
  source: string,
  entries: { key: string; sample: string; title: string }[]
): Signal[] => {
  const byKey = new Map<string, Signal>();
  for (const entry of entries) {
    const seen = byKey.get(entry.key);
    if (seen === undefined) {
      byKey.set(entry.key, { ...entry, count: 1, source });
    } else {
      seen.count += 1;
    }
  }
  return [...byKey.values()];
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
