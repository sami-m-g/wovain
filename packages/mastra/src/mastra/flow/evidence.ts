import { setTimeout as sleep } from "node:timers/promises";

import { readDossier, startDossier } from "@wovain/core/evidence";
import type { DossierRecord, DossierState } from "@wovain/core/evidence";
import { idea } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

import type { Actor } from "./actor";
import { flagContextOf } from "./flags";
import { getIdea } from "./ideas";

// The research dossier on an idea: Tavily Research reasons over the web and
// the merchant's Qloo taste data, and answers why now, how crowded, the
// price band and the risks, with citations. It runs on Tavily's side, so the
// merchant starts it and the app reads it back until it's done. Behind the
// tavily-evidence flag.

// Mini research takes about a minute; one still pending after this failed.
const DOSSIER_TIMEOUT_MS = 15 * 60_000;

export const tavilyEvidenceOff = () =>
  createError({
    fix: "Turn on the tavily-evidence flag for this environment.",
    message: "Research dossiers aren't available yet",
    status: 404,
    why: "The tavily-evidence flag is off.",
  });

const requireEvidence = async (actor: Actor) => {
  if (!(await actor.core.flags.isOn("tavily-evidence", flagContextOf(actor)))) {
    throw tavilyEvidenceOff();
  }
};

const save = async (
  actor: Actor,
  row: Awaited<ReturnType<typeof getIdea>>,
  dossier: DossierRecord
) => {
  await actor.db
    .update(idea)
    .set({ research: { ...row.research, dossier } })
    .where(and(eq(idea.id, row.id), eq(idea.userId, actor.userId)));
  return dossier;
};

// What Qloo knows, sent to Tavily as qloo-taste.json: the idea's Qloo theme
// and affinity, and the brand profile's Qloo entities and audience.
const tasteOf = async (
  actor: Actor,
  row: Awaited<ReturnType<typeof getIdea>>
) => {
  const brand = await actor.db.query.brandProfile.findFirst({
    where: { userId: actor.userId },
  });
  return {
    idea: {
      affinity: row.research.signals.affinity ?? null,
      avoidNames: row.avoidNames,
      qlooTag: row.research.qlooTag ?? null,
      seed: row.seed,
      theme: row.theme,
    },
    ...(brand !== undefined && {
      brand: {
        demographics: brand.demographics,
        niches: brand.niches,
        qlooEntities: brand.qlooEntities,
        tasteReferences: brand.tasteReferences,
      },
    }),
  };
};

// Starts a dossier, once per idea: a pending or finished one is returned as
// it is; a failed one starts again.
export const startIdeaDossier = async (actor: Actor, ideaId: string) => {
  await requireEvidence(actor);
  const row = await getIdea(actor, ideaId);
  const current = row.research.dossier;
  if (current !== undefined && current.status !== "failed") {
    return current;
  }
  const { requestId } = await startDossier(
    actor.core.tavily,
    {
      model: actor.core.researchModel,
      seed: row.seed,
      taste: await tasteOf(actor, row),
      theme: row.theme,
    },
    actor.log
  );
  actor.log?.set({ dossier: { ideaId, started: true } });
  return await save(actor, row, {
    requestId,
    startedAt: new Date().toISOString(),
    status: "pending",
  });
};

// Tavily's answer on a pending dossier. A read that throws is a procedure
// error (error tracking sees it) and the card keeps polling; once the dossier
// is past its time, the same error fails it instead, so a request Tavily
// lost (a 404 on an expired request ID) can't keep it pending for good.
const stateOf = async (
  actor: Actor,
  requestId: string,
  timedOut: boolean
): Promise<DossierState> => {
  try {
    return await readDossier(actor.core.tavily, requestId, actor.log);
  } catch (error) {
    if (!timedOut) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: `Tavily research couldn't be read: ${reason}`,
      status: "failed",
    };
  }
};

// Reads a pending dossier back from Tavily; a finished or failed one is
// returned as saved, and an idea without one returns null.
export const readIdeaDossier = async (
  actor: Actor,
  ideaId: string,
  now = Date.now()
): Promise<DossierRecord | null> => {
  await requireEvidence(actor);
  const row = await getIdea(actor, ideaId);
  const current = row.research.dossier;
  if (current === undefined) {
    return null;
  }
  if (current.status !== "pending") {
    return current;
  }
  const timedOut = now - Date.parse(current.startedAt) > DOSSIER_TIMEOUT_MS;
  const state = await stateOf(actor, current.requestId, timedOut);
  if (state.status === "done") {
    return await save(actor, row, {
      ...current,
      dossier: state.dossier,
      status: "done",
    });
  }
  if (state.status === "failed" || timedOut) {
    const error =
      state.status === "failed"
        ? state.error
        : "Tavily research didn't finish in 15 minutes";
    // The merchant sees it failed and can start again; error tracking sees
    // why.
    actor.log?.error?.(new Error(`Dossier ${current.requestId}: ${error}`));
    return await save(actor, row, { ...current, error, status: "failed" });
  }
  return current;
};

const dossierFailed = (ideaId: string, code: string, error: unknown) => {
  evlog.error({
    dossier: { ideaId },
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
      name: "DossierFailed",
    },
  });
};

const evidenceOn = async (actor: Actor) =>
  await actor.core.flags.isOn("tavily-evidence", flagContextOf(actor));

// An idea picked on the Home gets its dossier at once, with no click, while
// the merchant reviews the drop. Off with the flag; a start that fails is
// logged at error level and the drop page offers a retry.
export const autoStartDossier = async (actor: Actor, ideaId: string) => {
  if (!(await evidenceOn(actor))) {
    return;
  }
  try {
    await startIdeaDossier(actor, ideaId);
  } catch (error) {
    dossierFailed(ideaId, "DOSSIER_AUTO_START_FAILED", error);
  }
};

// How long a design waits for its idea's report, and how often it looks.
export const REPORT_WAIT_MS = 90_000;
const REPORT_POLL_MS = 5000;

// Before a design is drawn, its idea's report, if one is running, gets up
// to REPORT_WAIT_MS to finish, so the brief can use it. A report that isn't
// done by then (or can't be read, logged) is left out; the design goes on.
export const awaitDossier = async (
  actor: Actor,
  ideaId: string,
  waitMs = REPORT_WAIT_MS
) => {
  if (!(await evidenceOn(actor))) {
    return;
  }
  const until = Date.now() + waitMs;
  for (;;) {
    let record: DossierRecord | null;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one read per poll
      record = await readIdeaDossier(actor, ideaId);
    } catch (error) {
      dossierFailed(ideaId, "DOSSIER_READ_FAILED", error);
      return;
    }
    if (record?.status !== "pending" || Date.now() >= until) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- waiting between polls
    await sleep(Math.min(REPORT_POLL_MS, until - Date.now()));
  }
};
