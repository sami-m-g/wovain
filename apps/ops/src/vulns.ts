import type { Note } from "./gitlab.ts";

// Vuln to fix (docs/flows.md): a new High or Critical SAST finding goes to
// Duo Vulnerability Resolution, which opens a merge request; the shepherd
// then treats it like any Duo MR (Duo Code Review, guardrails, auto-merge).
// Each start is a note on one confidential "vuln-fix" issue, which is both
// the audit trail and the daily cap's count. Only findings GitLab's scanner
// reported are used: their ids, never their text.

export const VULN_LABEL = "vuln-fix";
export const MAX_VULN_FIXES_PER_DAY = 2;
// Older findings were there before the flow; a person triages those.
const NEW_WITHIN_MS = 14 * 86_400_000;
const DAY_MS = 86_400_000;
const STARTED =
  /<!-- wovain:vuln:(?<id>gid:\/\/gitlab\/Vulnerability\/\d+) -->/u;

export const startedMarker = (id: string) => `<!-- wovain:vuln:${id} -->`;

// The findings the ops job already handed to Duo, with when.
export const startedVulns = (notes: Note[]) =>
  new Map(
    notes.flatMap((n) => {
      const id = STARTED.exec(n.body)?.groups?.["id"];
      return id === undefined ? [] : [[id, n.created_at] as const];
    })
  );

export interface Vulnerability {
  id: string;
  detectedAt: string;
  mergeRequest: number | undefined;
  severity: string;
}

// The findings to hand to Duo now, within the daily cap.
export const pickVulns = <T extends Vulnerability>(
  vulns: T[],
  started: Map<string, string>,
  now: Date
) => {
  const today = [...started.values()].filter(
    (at) => now.getTime() - Date.parse(at) < DAY_MS
  ).length;
  const budget = Math.max(0, MAX_VULN_FIXES_PER_DAY - today);
  return vulns
    .filter(
      (v) =>
        !started.has(v.id) &&
        v.mergeRequest === undefined &&
        now.getTime() - Date.parse(v.detectedAt) < NEW_WITHIN_MS
    )
    .slice(0, budget);
};

// Merge requests GitLab links to findings the ops job handed to Duo.
export const vulnMergeRequests = (
  vulns: Vulnerability[],
  started: Map<string, string>
) =>
  vulns.flatMap((v) =>
    started.has(v.id) && v.mergeRequest !== undefined ? [v.mergeRequest] : []
  );
