import type { Alert } from "./posthog.ts";

// The PostHog loop (docs/flows.md): PostHog senses, Duo acts, PostHog
// verifies. Each KPI in .gitlab/duo/kpis.yml with a PostHog source has an
// alert named "kpi:<id>" (infra/posthog/kpis.tf) that fires while the KPI
// misses its target. The ops job reads those alerts, never a webhook's body:
//   signals    a firing KPI alert starts the scout flow early, at most once
//              a day, so the scout ranks it with today's numbers
//   verifyKpis a closed kpi-scout issue whose change merged is verified when
//              its KPI's alert stops firing, or marked missed after a week

export const KPI_SCOUT_LABEL = "kpi-scout";
export const KPI_VERIFIED_LABEL = "kpi::verified";
export const KPI_MISSED_LABEL = "kpi::missed";
// One early scout run a day, whatever fires.
const SCOUT_EVERY_MS = 20 * 3_600_000;
// A KPI is measured over days, so a fix gets a week before it counts as
// missed; alerts are checked daily, so a check after the merge (plus the
// deploy) is needed before it counts as verified.
const DEPLOY_GRACE_MS = 30 * 60_000;
const MISSED_AFTER_MS = 8 * 86_400_000;

const FIRING = "Firing";
const NOT_FIRING = "Not firing";
const KPI_ALERT = /^kpi:(?<id>[a-z0-9-]+)$/u;
const KPI_TITLE = /^(?<id>[a-z0-9-]+):/u;

// The KPI ids whose alerts fire now.
export const firingKpis = (alerts: Alert[]) =>
  alerts.flatMap((a) => {
    const id = KPI_ALERT.exec(a.name ?? "")?.groups?.["id"];
    return id !== undefined && a.state === FIRING ? [id] : [];
  });

// The scout flow titles its issues "<KPI id>: <change>".
export const kpiOfTitle = (title: string) =>
  KPI_TITLE.exec(title)?.groups?.["id"];

export const scoutDue = (lastStart: Date | undefined, now: Date) =>
  lastStart === undefined ||
  now.getTime() - lastStart.getTime() >= SCOUT_EVERY_MS;

export type KpiVerdict = "verified" | "missed" | "wait";

export const kpiVerdict = ({
  alert,
  mergedAt,
  now,
}: {
  alert: Alert;
  mergedAt: Date;
  now: Date;
}): KpiVerdict => {
  const checkedAt = Date.parse(alert.last_checked_at ?? "");
  const checkedSinceDeploy = checkedAt > mergedAt.getTime() + DEPLOY_GRACE_MS;
  if (alert.state === NOT_FIRING && checkedSinceDeploy) {
    return "verified";
  }
  if (
    alert.state === FIRING &&
    now.getTime() - mergedAt.getTime() > MISSED_AFTER_MS
  ) {
    return "missed";
  }
  return "wait";
};
