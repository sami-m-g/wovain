// Software Carbon Intensity (Green Software Foundation, ISO/IEC 21031:2024):
//   SCI = ((E x I) + M) per R
// E is energy (kWh), I location-based grid intensity (gCO2e/kWh), M the
// embodied share (gCO2e), and R the functional unit: 1,000 requests served
// by the web app. The post-code lifecycle's own footprint (CI minutes and
// Duo sessions) is part of E, so automating upkeep shows up in the score.
// Each constant says whether it is published or an estimate.

// Location-based grid intensity, Google Cloud's region table (2025 data,
// cloud.google.com/sustainability/region-carbon): published. GitLab.com's
// hosted Linux runners run in us-east1.
const GRID = { runners: 579, service: 432 } as const;

// Cloud Carbon Footprint's coefficients (cloudcarbonfootprint.org): average
// vCPU draw at 50% utilization between 0.71 W and 4.26 W, 0.392 W per GB of
// memory, PUE 1.1: estimate.
const VCPU_WATTS = (0.71 + 4.26) / 2;
const GB_WATTS = 0.392;
const PUE = 1.1;
// About 1,200 kgCO2e per 48-vCPU server over 4 years, per vCPU-hour: estimate.
const EMBODIED_G_PER_VCPU_HOUR = 1_200_000 / (4 * 8760 * 48);
// A Duo session: about 30 model calls at about 0.3 Wh each (Epoch AI's 2025
// per-query estimate), on the service region's grid: unverified estimate.
const DUO_SESSION_KWH = 30 * 0.0003;

// Instance sizes: the web app's Cloud Run service and a hosted small runner.
const SERVICE = { gb: 0.5, vcpus: 1 };
const RUNNER = { gb: 8, vcpus: 2 };

const kwh = (seconds: number, size: { vcpus: number; gb: number }) =>
  (seconds * (size.vcpus * VCPU_WATTS + size.gb * GB_WATTS) * PUE) / 3_600_000;
const embodied = (seconds: number, vcpus: number) =>
  (seconds / 3600) * vcpus * EMBODIED_G_PER_VCPU_HOUR;

export interface Measured {
  // Cloud Monitoring, the window.
  instanceSeconds: number;
  requests: number;
  // GitLab: summed job durations of main pipelines in the window.
  ciSeconds: number;
  // Duo Agent Platform sessions started in the project in the window.
  duoSessions: number;
}

interface Part {
  name: string;
  grams: number;
  basis: string;
}

export const sciOf = (m: Measured) => {
  const parts: Part[] = [
    {
      basis: `measured ${Math.round(m.instanceSeconds / 3600)} instance-hours at ${SERVICE.vcpus} vCPU, ${SERVICE.gb} GB`,
      grams:
        kwh(m.instanceSeconds, SERVICE) * GRID.service +
        embodied(m.instanceSeconds, SERVICE.vcpus),
      name: "Web app (Cloud Run)",
    },
    {
      basis: `measured ${Math.round(m.ciSeconds / 60)} CI minutes on main`,
      grams:
        kwh(m.ciSeconds, RUNNER) * GRID.runners +
        embodied(m.ciSeconds, RUNNER.vcpus),
      name: "CI (GitLab hosted runners)",
    },
    {
      basis: `measured ${m.duoSessions} sessions x ${DUO_SESSION_KWH * 1000} Wh (estimate)`,
      grams: m.duoSessions * DUO_SESSION_KWH * GRID.service,
      name: "Duo flows",
    },
  ];
  const total = parts.reduce((sum, p) => sum + p.grams, 0);
  const perThousand =
    m.requests === 0 ? undefined : (total / m.requests) * 1000;
  return { parts, perThousand, total };
};

export const sciReport = (m: Measured, at: Date, days: number) => {
  const { parts, perThousand, total } = sciOf(m);
  const headline =
    perThousand === undefined
      ? "no requests in the window, so no per-request score"
      : `**${perThousand.toFixed(2)} gCO2e per 1,000 requests**`;
  return [
    `# wovain SCI, ${at.toISOString().slice(0, 10)}`,
    "",
    `${headline} (${m.requests} requests, ${total.toFixed(1)} gCO2e over ${days} days). SCI = ((E x I) + M) per R, Green Software Foundation.`,
    "",
    "| Component | gCO2e | Basis |",
    "| --- | --- | --- |",
    ...parts.map((p) => `| ${p.name} | ${p.grams.toFixed(2)} | ${p.basis} |`),
    "",
    `Grid intensity (location-based, Google 2025): service ${GRID.service}, runners ${GRID.runners} gCO2e/kWh. Energy coefficients: Cloud Carbon Footprint (estimate). Duo session energy: unverified estimate. Constants and sources: apps/ops/src/sci.ts.`,
  ].join("\n");
};
