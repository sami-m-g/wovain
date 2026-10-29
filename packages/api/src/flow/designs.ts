import { randomUUID } from "node:crypto";

import { reviewDesign } from "@wovain/core/autopilot";
import { briefCompetition } from "@wovain/core/competition";
import { draftBrief, judgeDesign, redrawCanFix } from "@wovain/core/design";
import type { Previous } from "@wovain/core/design";
import { checkTrademarks } from "@wovain/core/evidence";
import { recordTaste } from "@wovain/core/taste";
import { design, run } from "@wovain/db/schema/seller";
import { and, count, desc, eq } from "drizzle-orm";

import type { Actor, RunDecision } from "./actor";
import { notFound } from "./actor";
import { withAgentTrace } from "./agent-trace";
import { isCompetitionOn } from "./competition";
import { requireFal, withArtistCall } from "./connections";
import { writerStyleFor } from "./drop-style";
import { flagContextOf } from "./flags";
import { getIdea } from "./ideas";
import { track } from "./metrics";
import { once } from "./once";
import { previewPlacement } from "./placements";
import { charge } from "./spend";
import { designAlreadyDecided, runNotWaiting } from "./transitions";

// An idea becomes a design: Nemotron writes the brief, fal draws the art,
// Nemotron judges both, looking at the art itself. A design the judge sends
// back is redrawn once. The merchant (or autopilot) then approves or rejects.

// The judge scores 0 to 100; agent_score is 0 to 1.
const JUDGE_SCALE = 100;

const byKey = async ({ db, userId }: Actor, key: string) =>
  await db.query.design.findFirst({ where: { idempotencyKey: key, userId } });

// design_generated and the judge's agent_score, for the approval rate and
// the quality trend. variant_index counts the idea's earlier designs.
const reportDesign = async (
  actor: Actor,
  row: {
    id: string;
    ideaId: string;
    judgment: { score: number };
    runId: string | null;
  }
) => {
  const [drawn] = await actor.db
    .select({ n: count() })
    .from(design)
    .where(eq(design.ideaId, row.ideaId));
  await track(actor, "design_generated", {
    design_id: row.id,
    model: actor.core.model,
    run_id: row.runId,
    variant_index: Math.max((drawn?.n ?? 1) - 1, 0),
  });
  await track(actor, "agent_score", {
    design_id: row.id,
    run_id: row.runId,
    score: row.judgment.score / JUDGE_SCALE,
    scorer: "design_judge",
    target: "design",
  });
};

// `requestId` keys the design: a run step passes its own, so a retried step
// keeps the brief and the art (fal is asked to draw once). Without one each
// call is a new design, as a merchant's "try again" means.
export const generateDesign = async (
  actor: Actor,
  ideaId: string,
  { requestId = randomUUID() }: { requestId?: string | undefined } = {}
) => {
  const key = `design:${actor.userId}:${requestId}`;
  const made = await byKey(actor, key);
  if (made !== undefined) {
    // A retried step that crashed before the preview renders it now.
    return await previewPlacement(actor, made);
  }
  const source = await getIdea(actor, ideaId);
  const { runId } = source;
  // The merchant's own fal account draws, or wovain's key while the
  // onboarding-wizard flag is on; checked first, so a missing grant stops
  // the step before any model call.
  await requireFal(actor);
  const { artist, nemotron } = actor.core;
  // tavily-evidence: the printed words are checked against trademark
  // records before the judge decides, and a match sends the design back.
  const guarded = await actor.core.flags.isOn(
    "tavily-evidence",
    flagContextOf(actor)
  );
  const competing = await isCompetitionOn(actor);
  // drop-style: the drop's tone and palette, with the brand voice as
  // guardrails; none when the flag is off or the suggestion failed.
  const style = await writerStyleFor(actor, ideaId);
  // One drawing: a brief, fal's art and the judge's look at both. Each paid
  // call is keyed, so a retried step reuses it; `previous` makes it the
  // redraw of a design the judge sent back.
  const draw = async (previous?: Previous) => {
    const at = previous === undefined ? key : `${key}:redraw`;
    const drafted = await once(actor, {
      key: `${at}:brief`,
      operation: "design_brief",
      perform: async () =>
        await draftBrief(
          nemotron,
          {
            avoidNames: source.avoidNames,
            // tavily-competition: the looks to avoid and the gap to aim at.
            competition: competing
              ? briefCompetition(source.competition)
              : undefined,
            idea: source.research,
            previous,
            style,
          },
          actor.log
        ),
      provider: "nebius",
      runId,
    });
    const submit = async () =>
      await withArtistCall(
        actor,
        async (call) => await artist(call).submit(drafted, actor.log)
      );
    const requested = await once(actor, {
      key: `${at}:art`,
      operation: "submit_art",
      // The design's credits pay for the art: charged once, when fal is
      // asked to draw, and given back if the request fails. A redraw is
      // wovain's quality cost and isn't charged again.
      perform:
        previous === undefined
          ? async () => await charge(actor, "design", { runId }, submit)
          : submit,
      provider: "fal",
      runId,
    });
    // Reading fal's answer again is free: no key needed.
    const art = await withArtistCall(
      actor,
      async (call) => await artist(call).result(requested, actor.log)
    );
    // Keyed too, so a retried step makes the same call on redrawing. The
    // trademark check rides in the same key: its result is saved with the
    // judgment.
    const judged = await once(actor, {
      key: `${at}:judge`,
      operation: "design_judge",
      perform: async () =>
        await judgeDesign(
          nemotron,
          {
            artwork: art,
            brief: drafted,
            idea: source.theme,
            trademark: guarded
              ? await checkTrademarks(
                  actor.core.tavily,
                  drafted.printedText,
                  actor.log
                )
              : undefined,
          },
          actor.log
        ),
      provider: "nebius",
      runId,
    });
    return { artwork: art, ...judged };
  };
  const { artwork, brief, judgment } = await withAgentTrace(
    actor,
    { runId, traceId: runId ?? ideaId },
    async () => {
      const first = await draw();
      // Ready, or held for something a redraw can't fix (a phrase the
      // trademark check couldn't reach): saved as it is.
      if (first.judgment.verdict === "ready" || !redrawCanFix(first.judgment)) {
        return first;
      }
      // Sent back: redrawn once from the judge's fixes. A redraw still sent
      // back is saved as it is, and the merchant sees it flagged.
      actor.log?.set({
        design: {
          failed: first.judgment.checks
            .filter((check) => !check.pass)
            .map((check) => check.rule),
          redrawn: true,
        },
      });
      return await draw({ brief: first.brief, judgment: first.judgment });
    }
  );
  await actor.db
    .insert(design)
    .values({
      artworkHeight: artwork.height,
      artworkUrl: artwork.url,
      artworkWidth: artwork.width,
      brief,
      ideaId,
      idempotencyKey: key,
      judgment,
      runId,
      userId: actor.userId,
    })
    .onConflictDoNothing({ target: design.idempotencyKey });
  const row = await byKey(actor, key);
  if (row === undefined) {
    throw new Error("The design wasn't saved");
  }
  await reportDesign(actor, row);
  return await previewPlacement(actor, row);
};

export const getDesign = async ({ db, userId }: Actor, id: string) => {
  const row = await db.query.design.findFirst({ where: { id, userId } });
  if (row === undefined) {
    throw notFound.design({ id });
  }
  return row;
};

export const listDesigns = async ({ db, userId }: Actor, runId?: string) =>
  await db
    .select()
    .from(design)
    .where(
      runId === undefined
        ? eq(design.userId, userId)
        : and(eq(design.userId, userId), eq(design.runId, runId))
    )
    .orderBy(desc(design.createdAt));

export interface Decision extends RunDecision {
  by: "merchant" | "autopilot";
}

// The only move out of pending_approval: approve or reject, once. A design
// already decided the same way answers that decision again (a second click
// or a retry is harmless); decided the other way it answers
// DESIGN_ALREADY_DECIDED, so nothing can flip it. A run draws several designs,
// and its gate opens on the merchant's call on the last pending one: that
// call resumes the run once the decision is committed: the resume writes the
// run row from its own connection, so resuming inside the transaction that
// holds that row's lock waits on itself forever. If the resume fails, the
// decision is undone and the run waits at its gate again.
const commitDecision = async (
  actor: Actor,
  id: string,
  { approve, by, reason }: Decision
) => {
  const {
    anyApproved,
    replay,
    row: decided,
    waitingRunId,
  } = await actor.db.transaction(async (tx) => {
    // A merchant's calls on one run's designs take turns on the run row,
    // so the last of two concurrent calls sees the other's and opens the
    // gate. NO KEY UPDATE leaves designs being drawn for the run free to
    // insert.
    const target = await tx.query.design.findFirst({
      columns: { runId: true },
      where: { id, userId: actor.userId },
    });
    if (by === "merchant" && target?.runId) {
      await tx
        .select({ id: run.id })
        .from(run)
        .where(eq(run.id, target.runId))
        .for("no key update");
    }
    const [row] = await tx
      .update(design)
      .set({
        decidedBy: by,
        decisionReason: reason ?? null,
        status: approve ? "approved" : "rejected",
      })
      .where(
        and(
          eq(design.id, id),
          eq(design.userId, actor.userId),
          eq(design.status, "pending_approval")
        )
      )
      .returning();
    if (row !== undefined && !approve) {
      await track(actor, "design_rejected", {
        decided_by: by,
        design_id: row.id,
        reason: reason ?? null,
        run_id: row.runId,
      });
    }
    if (row === undefined) {
      // Read inside the transaction: it holds the connection.
      const current = await tx.query.design.findFirst({
        where: { id, userId: actor.userId },
      });
      if (current === undefined) {
        throw notFound.design({ id });
      }
      const decidedStatus =
        current.status === "approved" ? "approved" : "rejected";
      // The same call again (a second click, a retry whose answer was lost)
      // finds its own decision: answer it, change nothing.
      if (decidedStatus === (approve ? "approved" : "rejected")) {
        return {
          anyApproved: approve,
          replay: true,
          row: current,
          waitingRunId: undefined,
        };
      }
      throw designAlreadyDecided({
        designId: current.id,
        status: decidedStatus,
      });
    }
    if (by !== "merchant" || row.runId === null) {
      return {
        anyApproved: approve,
        replay: false,
        row,
        waitingRunId: undefined,
      };
    }
    // The gate opens once every design of the run is decided: the merchant
    // approves one or more and rejects the rest.
    const decisions = await tx
      .select({ status: design.status })
      .from(design)
      .where(and(eq(design.runId, row.runId), eq(design.userId, actor.userId)));
    if (decisions.some((item) => item.status === "pending_approval")) {
      return {
        anyApproved: approve,
        replay: false,
        row,
        waitingRunId: undefined,
      };
    }
    const approvedSome = decisions.some((item) => item.status === "approved");
    // Only a run waiting at this gate: one waiting for its ideas (a design
    // drawn by hand meanwhile) is resumed by approveIdeas, not here.
    const [waiting] = await tx
      .update(run)
      .set({
        status: "running",
        step: approvedSome ? "approved" : "rejected",
      })
      .where(
        and(
          eq(run.id, row.runId),
          eq(run.status, "awaiting_approval"),
          eq(run.step, "approval")
        )
      )
      .returning({ id: run.id });
    if (waiting === undefined) {
      return {
        anyApproved: approvedSome,
        replay: false,
        row,
        waitingRunId: undefined,
      };
    }
    if (actor.runs === undefined) {
      throw new Error("No run engine to resume the run");
    }
    return {
      anyApproved: approvedSome,
      replay: false,
      row,
      waitingRunId: waiting.id,
    };
  });
  if (waitingRunId === undefined || actor.runs === undefined) {
    return { replay, row: decided };
  }
  try {
    // The run reads which designs were approved; the call says whether any.
    await actor.runs.resume(waitingRunId, { approve: anyApproved, reason });
  } catch (error) {
    // Undo only what this call set, and only while nothing has moved on.
    try {
      await actor.db.transaction(async (tx) => {
        await tx
          .update(design)
          .set({
            decidedBy: null,
            decisionReason: null,
            status: "pending_approval",
          })
          .where(
            and(
              eq(design.id, decided.id),
              eq(design.userId, actor.userId),
              eq(design.status, approve ? "approved" : "rejected")
            )
          );
        await tx
          .update(run)
          .set({ status: "awaiting_approval", step: "approval" })
          .where(and(eq(run.id, waitingRunId), eq(run.status, "running")));
      });
    } catch (undoError) {
      throw runNotWaiting(
        waitingRunId,
        new AggregateError(
          [error, undoError],
          "Resume failed and undoing the decision failed"
        )
      );
    }
    throw runNotWaiting(waitingRunId, error);
  }
  return { replay, row: decided };
};

// The merchant's call teaches the agents their taste (@wovain/core/taste).
// Memory is a nicety: a failed write never fails the decision.
const learnTaste = async (
  actor: Actor,
  decided: { brief: { title: string }; decisionReason: string | null },
  approve: boolean
) => {
  const { memory } = actor.core;
  if (memory === undefined) {
    return;
  }
  try {
    await recordTaste(memory, {
      approved: approve,
      reason: decided.decisionReason,
      title: decided.brief.title,
      userId: actor.userId,
    });
  } catch (error) {
    actor.log?.set({
      taste: { failed: error instanceof Error ? error.message : String(error) },
    });
  }
};

export const decideDesign = async (
  actor: Actor,
  id: string,
  decision: Decision
) => {
  const { replay, row: decided } = await commitDecision(actor, id, decision);
  // A replayed decision taught the agents the first time.
  if (decision.by === "merchant" && !replay) {
    await learnTaste(actor, decided, decision.approve);
  }
  return decided;
};

// Autopilot's review: Nemotron decides, gated by the judge's verdict.
export const autopilotDecide = async (
  actor: Actor,
  current: Awaited<ReturnType<typeof getDesign>>
) => {
  // A retried step finds its own decision and keeps it.
  if (current.status !== "pending_approval") {
    return current;
  }
  const source = await getIdea(actor, current.ideaId);
  const decision = await charge(
    actor,
    "assist",
    { runId: current.runId },
    async () =>
      await reviewDesign(
        actor.core.nemotron,
        {
          brief: current.brief,
          idea: source.theme,
          judgment: current.judgment,
        },
        actor.log
      )
  );
  return await decideDesign(actor, current.id, {
    approve: decision.approve,
    by: "autopilot",
    reason: decision.reason,
  });
};
