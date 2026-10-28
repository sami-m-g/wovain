import { readDossier, startDossier } from "@wovain/core/evidence";
import type { DossierRecord } from "@wovain/core/evidence";
import { idea } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { createError } from "evlog";

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
    { seed: row.seed, taste: await tasteOf(actor, row), theme: row.theme },
    actor.log
  );
  actor.log?.set({ dossier: { ideaId, started: true } });
  return await save(actor, row, {
    requestId,
    startedAt: new Date().toISOString(),
    status: "pending",
  });
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
  const state = await readDossier(
    actor.core.tavily,
    current.requestId,
    actor.log
  );
  if (state.status === "done") {
    return await save(actor, row, {
      ...current,
      dossier: state.dossier,
      status: "done",
    });
  }
  const timedOut =
    state.status === "pending" &&
    now - Date.parse(current.startedAt) > DOSSIER_TIMEOUT_MS;
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
