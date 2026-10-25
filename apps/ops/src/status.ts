// The public status page (GitLab Pages, status.wovain.com): current health,
// incident history, DORA metrics and the SCI score. The ops job renders it
// every 10 minutes (ops.ts) and the pages job publishes it. Only numbers and
// titles the ops job wrote itself appear: incident titles are generated from
// allowlisted error fields (heal.ts), never from log text.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WINDOW_DAYS = 30;

export interface IncidentRow {
  iid: number;
  title: string;
  state: "opened" | "closed";
  createdAt: string;
  closedAt: string | undefined;
}

export interface Dora {
  deploymentsPerWeek: number;
  // Incidents per deployment in the window.
  changeFailureRate: number | undefined;
  // Mean hours from an incident's opening to its closing.
  meanHoursToRestore: number | undefined;
  // Median hours from merge to production, when GitLab's DORA API has it.
  leadTimeHours: number | undefined;
}

export const doraOf = (input: {
  deployments: { createdAt: string }[];
  incidents: IncidentRow[];
  leadTimeSeconds: number | undefined;
  now: Date;
}): Dora => {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const deployments = input.deployments.filter(
    (d) => Date.parse(d.createdAt) >= since
  ).length;
  const incidents = input.incidents.filter(
    (i) => Date.parse(i.createdAt) >= since
  );
  const restored = incidents.flatMap((i) =>
    i.closedAt === undefined
      ? []
      : [(Date.parse(i.closedAt) - Date.parse(i.createdAt)) / HOUR_MS]
  );
  return {
    changeFailureRate:
      deployments === 0 ? undefined : incidents.length / deployments,
    deploymentsPerWeek: (deployments / WINDOW_DAYS) * 7,
    leadTimeHours:
      input.leadTimeSeconds === undefined
        ? undefined
        : input.leadTimeSeconds / 3600,
    meanHoursToRestore:
      restored.length === 0
        ? undefined
        : restored.reduce((sum, h) => sum + h, 0) / restored.length,
  };
};

type Health = "operational" | "degraded" | "incident";

export const healthOf = (openIncidents: number, recentErrors: number) => {
  if (openIncidents > 0) {
    return "incident";
  }
  return recentErrors > 0 ? "degraded" : "operational";
};

const LABEL: Record<Health, string> = {
  degraded: "Degraded: errors in the last 30 minutes",
  incident: "Incident in progress",
  operational: "All systems operational",
};

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const fixed = (n: number | undefined, digits: number, unit: string) =>
  n === undefined ? "no data yet" : `${n.toFixed(digits)}${unit}`;

export interface StatusInput {
  generatedAt: Date;
  health: Health;
  incidents: IncidentRow[];
  dora: Dora;
  // gCO2e per 1,000 requests from the sci job's latest report.
  sciPerThousand: number | undefined;
}

const incidentRow = (i: IncidentRow) => {
  const duration =
    i.closedAt === undefined
      ? "ongoing"
      : `${((Date.parse(i.closedAt) - Date.parse(i.createdAt)) / 60_000).toFixed(0)} min`;
  return `<tr><td>${escape(i.createdAt.slice(0, 16).replace("T", " "))} UTC</td><td>${escape(i.title)}</td><td>${i.state === "opened" ? "Open" : "Resolved"}</td><td>${duration}</td></tr>`;
};

export const renderStatus = (s: StatusInput) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>wovain status</title>
<style>
:root { --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --ok: #1a7f37; --warn: #9a6700; --bad: #cf222e; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --ok: #3fb950; --warn: #d29922; --bad: #f85149; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 16px; }
h1 { font-size: 1.5rem; margin: 0 0 16px; }
h2 { font-size: 1.1rem; margin: 32px 0 8px; }
.banner { border: 1px solid var(--line); border-left: 6px solid var(--state); border-radius: 8px; padding: 16px; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.tile { border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.tile b { display: block; font-size: 1.25rem; }
.tile span, footer, .note { color: var(--muted); font-size: 0.875rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
td, th { text-align: left; padding: 8px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
.wrap { overflow-x: auto; }
</style>
</head>
<body>
<main>
<h1>wovain status</h1>
<div class="banner" style="--state: var(${{ degraded: "--warn", incident: "--bad", operational: "--ok" }[s.health]})">${LABEL[s.health]}</div>
<h2>Incidents, last ${WINDOW_DAYS} days</h2>
${
  s.incidents.length === 0
    ? `<p class="note">No incidents.</p>`
    : `<div class="wrap"><table><thead><tr><th>Opened</th><th>Incident</th><th>Status</th><th>Duration</th></tr></thead><tbody>${s.incidents.map(incidentRow).join("")}</tbody></table></div>`
}
<h2>Delivery (DORA, last ${WINDOW_DAYS} days)</h2>
<div class="grid">
<div class="tile"><b>${fixed(s.dora.deploymentsPerWeek, 1, "")}</b><span>deployments a week</span></div>
<div class="tile"><b>${fixed(s.dora.leadTimeHours, 1, " h")}</b><span>lead time for changes</span></div>
<div class="tile"><b>${s.dora.changeFailureRate === undefined ? "no data yet" : `${(s.dora.changeFailureRate * 100).toFixed(0)}%`}</b><span>change failure rate</span></div>
<div class="tile"><b>${fixed(s.dora.meanHoursToRestore, 1, " h")}</b><span>time to restore</span></div>
</div>
<h2>Carbon (SCI)</h2>
<div class="grid">
<div class="tile"><b>${fixed(s.sciPerThousand, 2, " g")}</b><span>CO2e per 1,000 requests, Green Software Foundation SCI</span></div>
</div>
<p class="note">Incidents open when production errors repeat and close once the fix is verified in production. Failure rate counts incidents per production deployment.</p>
<footer>Updated ${escape(s.generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC by wovain's ops job.</footer>
</main>
</body>
</html>
`;
