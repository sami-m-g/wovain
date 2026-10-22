import { createHash } from "node:crypto";

import { AUTOPILOT_TERMS, MAX_DECISIONS } from "@wovain/shared/autopilot";
import type {
  AutopilotRun,
  AutopilotStart,
  RunArt,
  RunDecision,
} from "@wovain/shared/autopilot";

import type { Store } from "../store.ts";

// An autopilot run's life: started only for a merchant who opted in on
// wovain's confirm page, stopped by the merchant, the operator switch or its
// cost cap, and a log of every decision made in it.

// A refusal the agent reads and acts on (not a server fault).
export class AutopilotRefusedError extends Error {
  override name = "AutopilotRefusedError";
}

// The default key: one run per idea per day, so a retried start is the
// same run.
export const runKeyFor = (idea: string, now = new Date()) =>
  createHash("sha256")
    .update(`${idea.trim().toLowerCase()}|${now.toISOString().slice(0, 10)}`)
    .digest("hex")
    .slice(0, 24);

export const decisionOf = (
  made: Omit<RunDecision, "at" | "limits"> & { limits?: string[] }
): RunDecision => ({
  at: new Date().toISOString(),
  choice: made.choice.slice(0, 80),
  limits: (made.limits ?? []).slice(0, 10).map((item) => item.slice(0, 200)),
  point: made.point,
  reason: made.reason.slice(0, 600),
  subject: made.subject.slice(0, 120),
});

export const withDecision = (
  run: AutopilotRun,
  made: RunDecision
): AutopilotRun => ({
  ...run,
  decisions: [...run.decisions, made].slice(-MAX_DECISIONS),
});

const isOn = async (store: Store) => {
  const consent = await store.getAutopilotConsent();
  return (
    consent?.version === AUTOPILOT_TERMS.version &&
    consent.revokedAt === undefined
  );
};

export const startRun = async (store: Store, input: AutopilotStart) => {
  if (!(await isOn(store))) {
    throw new AutopilotRefusedError(
      "The merchant hasn't turned autopilot on. Call autopilot_opt_in and show them the link: they confirm in their own browser."
    );
  }
  const now = new Date();
  return await store.startRun({
    art: [],
    createdAt: now.toISOString(),
    decisions: [],
    designs: {},
    dropped: [],
    id: input.runKey ?? runKeyFor(input.idea, now),
    idea: input.idea,
    spentUsd: 0,
    status: "running",
    videos: input.videos,
  });
};

// The run, if it's still running and the merchant hasn't turned autopilot
// off since it started.
export const runningRun = async (store: Store, runId: string) => {
  const [runs, on] = await Promise.all([store.getAutopilotRuns(), isOn(store)]);
  const run = runs.find((item) => item.id === runId);
  if (run?.status !== "running" || !on) {
    const why =
      run === undefined
        ? "doesn't exist"
        : `is ${on ? run.status : "off"}${run.stopReason === undefined ? "" : `: ${run.stopReason}`}`;
    throw new AutopilotRefusedError(`Autopilot run ${runId} ${why}.`);
  }
  return run;
};

// Whether an autopilot run is running for this merchant.
export const isRunning = async (store: Store) => {
  const runs = await store.getAutopilotRuns();
  return runs.some((run) => run.status === "running");
};

// Ends a running run: done when it finished, stopped with a reason otherwise.
export const stopRun = async (
  store: Store,
  runId: string,
  { done, reason }: { done: boolean; reason: string }
) =>
  await store.changeRun(runId, (run) => {
    if (run.status !== "running") {
      return run;
    }
    return done
      ? { ...run, status: "done" }
      : { ...run, status: "stopped", stopReason: reason.slice(0, 300) };
  });

// The merchant's own off switch: no run starts or decides until they opt in
// again on the confirm page.
export const turnOff = async (store: Store) => {
  const consent = await store.getAutopilotConsent();
  if (consent !== undefined && consent.revokedAt === undefined) {
    await store.saveAutopilotConsent({
      ...consent,
      revokedAt: new Date().toISOString(),
    });
  }
};

export type Spend = "art" | "audio" | "image" | "ocr" | "video";

interface Charge {
  // For art: whether every piece declared its printed words.
  declared?: boolean;
  on: boolean;
  usd: number;
  what: Spend;
}

const roundCents = (usd: number) => Math.round(usd * 100) / 100;

// Why the job can't run in this run, and whether that stops the run.
const refusalOf = (run: AutopilotRun, { declared, on, usd, what }: Charge) => {
  if (!on) {
    return {
      reason: `Autopilot is switched off on this wovain server; run ${run.id} stopped.`,
      stops: true,
    };
  }
  if ((what === "video" || what === "audio") && !run.videos) {
    return {
      reason: `Videos are off for autopilot run ${run.id}: use the mockups and ad images.`,
      stops: false,
    };
  }
  if (what === "art" && declared !== true) {
    return {
      reason:
        "In autopilot, every art piece declares its printed words in text ([] for none).",
      stops: false,
    };
  }
  return roundCents(run.spentUsd + usd) > AUTOPILOT_TERMS.maxSpendUsd
    ? {
        reason: `Autopilot run ${run.id} stopped: this ${what} ($${usd.toFixed(2)}) would take it past its $${AUTOPILOT_TERMS.maxSpendUsd} cap ($${run.spentUsd.toFixed(2)} spent).`,
        stops: true,
      }
    : undefined;
};

// Paid fal work while a run is running counts against its cap at list
// price, before the job is sent. Work that would pass the cap, or any work
// while the operator switch is off, stops the run.
export const chargeRun = async (store: Store, charge: Charge) => {
  let refused: string | undefined;
  await store.changeRunningRun((run) => {
    const refusal = refusalOf(run, charge);
    refused = refusal?.reason;
    if (refusal !== undefined) {
      return refusal.stops
        ? {
            ...run,
            status: "stopped",
            stopReason: refusal.reason.slice(0, 300),
          }
        : run;
    }
    return { ...run, spentUsd: roundCents(run.spentUsd + charge.usd) };
  });
  if (refused !== undefined) {
    throw new AutopilotRefusedError(refused);
  }
};

// Records art jobs generate_art sent in the running run, each with the
// words its piece declared, or the image a job made.
export const recordArt = async (
  store: Store,
  change: (art: RunArt[]) => RunArt[]
) =>
  await store.changeRunningRun((run) => ({
    ...run,
    art: change(run.art).slice(-40),
  }));
