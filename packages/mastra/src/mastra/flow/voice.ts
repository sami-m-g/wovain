import {
  notHeard,
  openProposal,
  resolveProposal,
  sealProposal,
  VOICE_RATE_LIMIT,
  VOICE_SYSTEM,
  voicePrompt,
  voiceReplySchema,
  VoiceProposalError,
} from "@wovain/core/voice";
import type {
  Clip,
  VoiceContext,
  VoiceItem,
  VoiceProposal,
  VoiceScreen,
} from "@wovain/core/voice";
import { design, idea, run } from "@wovain/db/schema/seller";
import { voiceCommand } from "@wovain/db/schema/voice";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { createError } from "evlog";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { approvalsFor } from "./approvals";
import { flagContextOf } from "./flags";

// Voice commands (openspec voice-commands): a clip becomes a proposal the
// merchant confirms. This side transcribes, builds what the merchant can
// refer to from their own rows, asks the voice_intent agent and seals the
// proposal; ../routers/voice runs a confirmed proposal through the same
// procedures the buttons call. The transcript goes back to the merchant
// only: never to analytics, logs or traces.

export const voiceOff = () =>
  createError({
    fix: "Turn on the voice-input flag for this environment.",
    message: "Voice commands aren't available yet",
    status: 404,
    why: "The voice-input flag is off.",
  });

export const voiceEnabled = async (actor: Actor) =>
  await actor.core.flags.isOn("voice-input", flagContextOf(actor));

export const requireVoice = async (actor: Actor) => {
  if (!(await voiceEnabled(actor))) {
    throw voiceOff();
  }
};

// The items one command may name: enough for a screen, few enough for a
// short prompt.
const MAX_ITEMS = 20;
const MAX_LABEL = 120;

const item = (id: string, label: string): VoiceItem => ({
  id,
  label: label.trim().slice(0, MAX_LABEL) || id,
});

// What the merchant sees on this screen, from their own rows: the run's
// ideas (best first) and its designs waiting for a decision, and their
// pending approvals when the queue is on.
export const voiceContextOf = async (
  actor: Actor,
  { runId, screen }: { runId?: string | undefined; screen: VoiceScreen }
): Promise<VoiceContext> => {
  const pendingApprovals = async () => {
    if (
      !(await actor.core.flags.isOn("autonomy-approvals", flagContextOf(actor)))
    ) {
      return [];
    }
    const pending = await approvalsFor(actor).list({
      limit: MAX_ITEMS,
      statuses: ["pending"],
      userId: actor.userId,
    });
    return pending.map((row) => item(row.id, row.title));
  };
  if (runId === undefined) {
    return {
      approvals: await pendingApprovals(),
      designs: [],
      ideas: [],
      screen,
    };
  }
  const [owned] = await actor.db
    .select({ id: run.id })
    .from(run)
    .where(and(eq(run.id, runId), eq(run.userId, actor.userId)));
  if (owned === undefined) {
    throw notFound.run({ id: runId });
  }
  const [ideas, designs, approvals] = await Promise.all([
    actor.db
      .select({ id: idea.id, theme: idea.theme })
      .from(idea)
      .where(and(eq(idea.runId, runId), eq(idea.userId, actor.userId)))
      .orderBy(asc(idea.rank))
      .limit(MAX_ITEMS),
    actor.db
      .select({ brief: design.brief, id: design.id })
      .from(design)
      .where(
        and(
          eq(design.runId, runId),
          eq(design.userId, actor.userId),
          eq(design.status, "pending_approval")
        )
      )
      .orderBy(asc(design.createdAt))
      .limit(MAX_ITEMS),
    pendingApprovals(),
  ]);
  return {
    approvals,
    designs: designs.map((row) => item(row.id, row.brief.title)),
    ideas: ideas.map((row) => item(row.id, row.theme)),
    runId,
    screen,
  };
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

export const voiceRateLimited = () =>
  createError({
    code: "VOICE_RATE_LIMITED",
    fix: "Wait a minute, then hold the button again.",
    message: "Too many voice commands. Wait a minute and try again",
    status: 429,
    why: `Voice allows ${VOICE_RATE_LIMIT.perMinute} commands a minute and ${VOICE_RATE_LIMIT.perHour} an hour per merchant.`,
  });

// Claims one voice command for the merchant, or refuses it past the rate
// limit. Counted in Postgres under a per-merchant lock, so every Cloud Run
// instance sees the same count (the promo redeem limit's pattern,
// packages/billing/src/redeem.ts). The row's id becomes the proposal's jti.
export const claimVoiceCommand = async (actor: Actor, now = new Date()) =>
  await actor.db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`voice:${actor.userId}`}))`
    );
    const hourAgo = new Date(now.getTime() - MS_PER_HOUR);
    const minuteAgo = new Date(now.getTime() - MS_PER_MINUTE);
    // Older rows count for nothing: their tokens expired long ago.
    await tx
      .delete(voiceCommand)
      .where(
        and(
          eq(voiceCommand.userId, actor.userId),
          lt(voiceCommand.createdAt, hourAgo)
        )
      );
    const [used] = await tx
      .select({
        hour: sql<number>`count(*)::int`,
        minute: sql<number>`(count(*) filter (where ${voiceCommand.createdAt} >= ${minuteAgo}))::int`,
      })
      .from(voiceCommand)
      .where(
        and(
          eq(voiceCommand.userId, actor.userId),
          gte(voiceCommand.createdAt, hourAgo)
        )
      );
    if (
      (used?.minute ?? 0) >= VOICE_RATE_LIMIT.perMinute ||
      (used?.hour ?? 0) >= VOICE_RATE_LIMIT.perHour
    ) {
      throw voiceRateLimited();
    }
    const [claimed] = await tx
      .insert(voiceCommand)
      .values({ createdAt: now, userId: actor.userId })
      .returning({ id: voiceCommand.id });
    if (claimed === undefined) {
      throw new Error("The voice command wasn't recorded");
    }
    return claimed.id;
  });

export interface VoiceCommand {
  proposal: VoiceProposal;
  // Absent when there's nothing to confirm.
  token?: string | undefined;
  transcript: string;
}

export const proposeVoiceCommand = async (
  actor: Actor,
  input: Clip & { runId?: string | undefined; screen: VoiceScreen }
): Promise<VoiceCommand> => {
  await requireVoice(actor);
  // Built first: a run the merchant doesn't own fails before any paid call.
  const context = await voiceContextOf(actor, input);
  // Counted before any paid call, refused past the limit.
  const jti = await claimVoiceCommand(actor);
  const heard = await actor.core.transcriber.transcribe(input, actor.log);
  const proposal: VoiceProposal =
    heard.text === ""
      ? notHeard()
      : resolveProposal(
          await actor.core.nemotron({
            log: actor.log,
            name: "voice_intent",
            prompt: voicePrompt(heard.text, context),
            schema: voiceReplySchema,
            system: VOICE_SYSTEM,
            temperature: 0,
          }),
          context
        );
  // The intent and the model, never the words.
  actor.log?.set({
    voice: {
      fallback: heard.fallback,
      intent: proposal.kind,
      model: heard.model,
    },
  });
  await actor.analytics?.capture({
    distinctId: actor.userId,
    event: "voice_command_proposed",
    properties: {
      fallback: heard.fallback,
      intent: proposal.kind,
      model: heard.model,
      screen: input.screen,
    },
  });
  return {
    proposal,
    token:
      proposal.kind === "none"
        ? undefined
        : sealProposal(actor.core.sealer, actor.userId, { jti, proposal }),
    transcript: heard.text,
  };
};

// Dictation: a clip becomes text for the merchant to edit in a field. Same
// flag, rate limit and speech models as a command, but no intent parsing and
// no action; the text goes back to the merchant only.
export const dictateClip = async (
  actor: Actor,
  input: Clip
): Promise<{ text: string }> => {
  await requireVoice(actor);
  // Counted before the paid call, refused past the limit.
  await claimVoiceCommand(actor);
  const heard = await actor.core.transcriber.transcribe(input, actor.log);
  // The model, never the words.
  actor.log?.set({
    voice: { dictation: true, fallback: heard.fallback, model: heard.model },
  });
  await actor.analytics?.capture({
    distinctId: actor.userId,
    event: "voice_dictated",
    properties: { fallback: heard.fallback, model: heard.model },
  });
  return { text: heard.text };
};

// The proposal behind a token, for this merchant only, while it's fresh.
export const openVoiceProposal = (actor: Actor, token: string) => {
  try {
    return openProposal(actor.core.sealer, actor.userId, token);
  } catch (error) {
    if (error instanceof VoiceProposalError) {
      throw createError({
        cause: error,
        fix: "Hold the button and say the command again.",
        message: error.message,
        status: error.code === "EXPIRED" ? 410 : 400,
        why:
          error.code === "EXPIRED"
            ? "Voice proposals last 5 minutes."
            : "The token was changed or belongs to another account.",
      });
    }
    throw error;
  }
};

export const voiceAlreadyConfirmed = () =>
  createError({
    code: "VOICE_ALREADY_CONFIRMED",
    fix: "Hold the button and say the command again.",
    message: "This voice command was already confirmed",
    status: 409,
    why: "A voice proposal runs at most once.",
  });

// Opens the token and marks its command confirmed, atomically: only the first
// confirm of a token gets the proposal, so a retry, a second tab or a resent
// request runs nothing and spends no credits. The mark stays even if the
// action then fails: the merchant says the command again.
export const confirmVoiceProposal = async (
  actor: Actor,
  token: string,
  now = new Date()
): Promise<VoiceProposal> => {
  const { jti, proposal } = openVoiceProposal(actor, token);
  const [marked] = await actor.db
    .update(voiceCommand)
    .set({ confirmedAt: now })
    .where(
      and(
        eq(voiceCommand.id, jti),
        eq(voiceCommand.userId, actor.userId),
        isNull(voiceCommand.confirmedAt)
      )
    )
    .returning({ id: voiceCommand.id });
  if (marked === undefined) {
    throw voiceAlreadyConfirmed();
  }
  return proposal;
};
