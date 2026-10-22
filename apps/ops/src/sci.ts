// Software Carbon Intensity (Green Software Foundation, ISO/IEC 21031:2024):
//   SCI = ((E × I) + M) per R
// E is energy (kWh), I the location-based grid intensity (gCO2e/kWh), M the
// embodied emissions share (gCO2e), R the functional unit: one merchant run
// from an idea to a paused Meta campaign. Each constant below says whether it
// is measured, published or an estimate, and where it comes from.

// Location-based grid intensity, Google Cloud's region table (2025 data,
// cloud.google.com/sustainability/region-carbon): published.
const GRID = {
  // App Hosting / Cloud Run, Iowa. Google's 88% CFE is a market-based
  // figure, which SCI excludes, so it isn't credited.
  "us-central1": 432,
  // GitLab.com hosted Linux runners (docs.gitlab.com, hosted runners):
  // us-east1 and us-east5; us-east1 is the dirtier, so it's used.
  "us-east1": 579,
} as const;

// Cloud Carbon Footprint's Google Cloud coefficients (cloudcarbonfootprint.org
// methodology): estimate. Average vCPU draw at 50% utilization between its
// 0.71 W minimum and 4.26 W maximum, 0.392 W per GB of memory, PUE 1.1.
const VCPU_WATTS = (0.71 + 4.26) / 2;
const GB_WATTS = 0.392;
const PUE = 1.1;
// Embodied: about 1,200 kgCO2e per 48-vCPU server over 4 years, shared per
// vCPU-hour (CCF's approach): estimate.
const EMBODIED_G_PER_VCPU_HOUR = 1_200_000 / (4 * 8760 * 48);

// One run, from the design, ads and campaign playbooks (estimates):
const RUN = {
  // judge_design and research_trends on Nemotron (Nebius).
  modelCalls: 2,
  // MCP requests: settings, research, judge, artwork, price, design widget
  // and record, Fourthwall proxy calls, video plan, generation, ad widgets,
  // campaign plan, rules, campaign widget.
  requests: 40,
  // Assumed weekly volume for sharing CI across runs (a demo-scale shop
  // network; the report shows the CI share separately).
  runsPerWeek: 20,
  // One 5-second fal clip per product, cropped to every ratio (reframe_videos).
  videoClips: 1,
};
// About 0.3 Wh per chat-sized model call (Epoch AI's 2025 estimate for a
// typical query): unverified estimate.
const MODEL_CALL_KWH = 0.0003;
// fal reports GPU seconds per clip (collect_ad_media keeps them: measured)
// but names no GPU and publishes no energy data, so each second is taken at
// an H100's 700 W TDP with PUE: estimate. With no recorded clip, one
// H100-minute per clip: unverified estimate.
const GPU_WATTS = 700;
const FALLBACK_CLIP_GPU_SECONDS = 60;
const gpuKwh = (seconds: number) => (seconds * GPU_WATTS * PUE) / 3_600_000;

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const kwh = (seconds: number, vcpus: number, gb: number) =>
  (seconds * (vcpus * VCPU_WATTS + gb * GB_WATTS) * PUE) / 3_600_000;
const embodied = (seconds: number, vcpus: number) =>
  (seconds / 3600) * vcpus * EMBODIED_G_PER_VCPU_HOUR;

export interface Measured {
  // Cloud Monitoring, the last 7 days.
  instanceSeconds: number;
  requests: number;
  // GitLab: summed job durations of main pipelines, the last 7 days.
  ciSeconds: number;
  mainPipelines: number;
  // Firestore ad-media: GPU seconds fal reported per generated clip.
  clipGpuSeconds: number[];
}

interface Part {
  name: string;
  grams: number;
  basis: string;
}

export const sciOf = (m: Measured) => {
  const secondsPerRequest =
    m.requests === 0 ? 0 : m.instanceSeconds / m.requests;
  // App Hosting: 1 vCPU, 0.5 GiB (apphosting.yaml).
  const serverSeconds = secondsPerRequest * RUN.requests;
  // Hosted runner: 2 vCPU, 8 GB; a week of main pipelines over a week of runs.
  const ciSecondsPerRun = m.ciSeconds / RUN.runsPerWeek;
  const clips = m.clipGpuSeconds.length;
  const clipSeconds =
    clips === 0 ? FALLBACK_CLIP_GPU_SECONDS : median(m.clipGpuSeconds);
  const parts: Part[] = [
    {
      basis: `measured ${secondsPerRequest.toFixed(2)} s of instance time per request × ${RUN.requests} requests`,
      grams:
        kwh(serverSeconds, 1, 0.5) * GRID["us-central1"] +
        embodied(serverSeconds, 1),
      name: "Server (App Hosting, us-central1)",
    },
    {
      basis: `measured ${Math.round(m.ciSeconds / 60)} CI minutes over ${m.mainPipelines} main pipelines a week ÷ ${RUN.runsPerWeek} runs a week (assumed)`,
      grams:
        kwh(ciSecondsPerRun, 2, 8) * GRID["us-east1"] +
        embodied(ciSecondsPerRun, 2),
      name: "CI (GitLab hosted runners, us-east1)",
    },
    {
      basis: `${RUN.modelCalls} Nemotron calls × 0.3 Wh (estimate)`,
      grams: RUN.modelCalls * MODEL_CALL_KWH * GRID["us-central1"],
      name: "Model calls (Nebius)",
    },
    {
      basis:
        clips === 0
          ? `${RUN.videoClips} clip × one H100-minute (estimate: no recorded fal clips yet)`
          : `${RUN.videoClips} clip × median ${clipSeconds.toFixed(1)} GPU-seconds over ${clips} recorded fal clips (measured) at ${GPU_WATTS} W (estimate: fal names no GPU)`,
      grams: RUN.videoClips * gpuKwh(clipSeconds) * GRID["us-central1"],
      name: "Video generation (fal)",
    },
  ];
  const total = parts.reduce((sum, p) => sum + p.grams, 0);
  return { parts, secondsPerRequest, total };
};

export const sciReport = (m: Measured, at: Date) => {
  const { parts, total } = sciOf(m);
  return [
    `# wovain SCI, ${at.toISOString().slice(0, 10)}`,
    "",
    `**${total.toFixed(2)} gCO2e per run** (one idea-to-paused-campaign run), SCI = ((E × I) + M) per R, Green Software Foundation.`,
    "",
    "| Component | gCO2e per run | Basis |",
    "| --- | --- | --- |",
    ...parts.map((p) => `| ${p.name} | ${p.grams.toFixed(3)} | ${p.basis} |`),
    "",
    `Grid intensity (location-based, Google 2025): us-central1 ${GRID["us-central1"]}, us-east1 ${GRID["us-east1"]} gCO2e/kWh. Energy coefficients: Cloud Carbon Footprint (estimate). Model energy and video watts: unverified estimates; video GPU-seconds are measured when the Basis says so. Constants and sources: apps/ops/src/sci.ts.`,
  ].join("\n");
};
