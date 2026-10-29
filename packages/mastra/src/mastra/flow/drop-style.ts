import { suggestDropStyle, writerStyle } from "@wovain/core/drop-style";
import type { DropStyle } from "@wovain/core/drop-style";
import { DecisionTrace } from "@wovain/core/trace";
import { user } from "@wovain/db/schema/auth";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { idea } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { draftBlank } from "./brand-discovery";
import { flagContextOf } from "./flags";
import { getIdea } from "./ideas";

// Each drop's own tone and palette (openspec drop-style), behind the
// drop-style flag: suggested from the idea's Qloo audience and the brand's
// voice and colours, saved on the idea, picked by the merchant in the new
// drop flow, and read by the brief writer and the ad writer. The brand voice
// stays as guardrails. The suggestion is saved in the decision trace.

export const dropStyleOn = async (actor: Actor) =>
  await actor.core.flags.isOn("drop-style", flagContextOf(actor));

const styleOff = () =>
  createError({
    fix: "Turn on the drop-style flag for this environment.",
    message: "Per-drop tone and colours aren't available yet",
    status: 404,
    why: "The drop-style flag is off.",
  });

const localeOf = async (actor: Actor) => {
  const [row] = await actor.db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, actor.userId));
  return row?.locale ?? "en";
};

// A trace that won't save doesn't undo the choice it records; the
// failure reaches error tracking.
const flush = async (actor: Actor, trace: DecisionTrace) => {
  try {
    await trace.flush();
  } catch (error) {
    evlog.error({
      decisionTrace: {
        reason: error instanceof Error ? error.message : String(error),
        userId: actor.userId,
      },
      error: "DECISION_TRACE_NOT_SAVED",
    });
  }
};

const save = async (actor: Actor, ideaId: string, style: DropStyle) => {
  await actor.db
    .update(idea)
    .set({ style })
    .where(and(eq(idea.id, ideaId), eq(idea.userId, actor.userId)));
};

// The idea's style, suggested and saved the first time it is asked for.
export const styleOf = async (
  actor: Actor,
  ideaId: string
): Promise<DropStyle> => {
  const row = await getIdea(actor, ideaId);
  if (row.style !== null) {
    return row.style;
  }
  const [[brand], locale, blank] = await Promise.all([
    actor.db
      .select({ palette: brandProfile.palette, voice: brandProfile.voice })
      .from(brandProfile)
      .where(eq(brandProfile.userId, actor.userId)),
    localeOf(actor),
    draftBlank(actor),
  ]);
  const trace = new DecisionTrace(
    { runId: row.runId ?? undefined, userId: actor.userId },
    traceSinkFor(actor)
  );
  try {
    const style = await suggestDropStyle(
      { ask: actor.core.nemotron, log: actor.log, trace },
      {
        blank,
        brand: { palette: brand?.palette ?? [], voice: brand?.voice },
        idea: row.research,
        locale,
      }
    );
    await save(actor, ideaId, style);
    return style;
  } finally {
    await flush(actor, trace);
  }
};

export const ideaStyle = async (actor: Actor, ideaId: string) => {
  if (!(await dropStyleOn(actor))) {
    throw styleOff();
  }
  return await styleOf(actor, ideaId);
};

// The merchant's pick among the suggested tones and palettes, or their own
// tone line. Only suggested palettes can be picked, so every saved palette
// passed the contrast check on the blank.
export const pickStyle = async (
  actor: Actor,
  ideaId: string,
  pick: {
    palette?: number | undefined;
    tone?: number | undefined;
    toneLine?: string | undefined;
  }
) => {
  const style = await ideaStyle(actor, ideaId);
  const tone =
    pick.toneLine === undefined
      ? (style.tones[pick.tone ?? -1] ?? style.tone)
      : { label: style.tone?.label ?? "own", line: pick.toneLine };
  const palette =
    pick.palette === undefined ? style.palette : style.palettes[pick.palette];
  if (palette === undefined && pick.palette !== undefined) {
    throw createError({
      fix: "Pick one of the suggested colour sets.",
      message: "That colour set isn't one of the suggestions",
      status: 400,
    });
  }
  const next: DropStyle = { ...style, palette, tone };
  await save(actor, ideaId, next);
  // The pick is a decision too: recorded in the trace.
  const trace = new DecisionTrace(
    { userId: actor.userId },
    traceSinkFor(actor)
  );
  trace.add({
    agent: "drop_style",
    inputSummary: `idea ${ideaId}`,
    output: { palette: next.palette?.inks, tone: next.tone?.label },
    sources: [{ provider: "rule", title: "the merchant's pick" }],
    step: "drop.style.pick",
  });
  await flush(actor, trace);
  return next;
};

// What a writer gets for this idea: its style when the flag is on, else
// nothing. A failed suggestion is logged and the drop goes on without it.
export const writerStyleFor = async (actor: Actor, ideaId: string) => {
  if (!(await dropStyleOn(actor))) {
    return;
  }
  try {
    return writerStyle(await styleOf(actor, ideaId));
  } catch (error) {
    evlog.error({
      dropStyle: { ideaId },
      error: {
        code: "DROP_STYLE_FAILED",
        message: error instanceof Error ? error.message : String(error),
        name: "DropStyleFailed",
      },
    });
  }
};
