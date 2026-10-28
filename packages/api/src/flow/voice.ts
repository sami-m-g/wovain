import {
  openProposal,
  resolveProposal,
  sealProposal,
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
import { and, asc, eq } from "drizzle-orm";
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

const NOT_HEARD = "I didn't catch that. Hold the button and try again.";

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
  const heard = await actor.core.transcriber.transcribe(input, actor.log);
  const proposal: VoiceProposal =
    heard.text === ""
      ? { kind: "none", reason: NOT_HEARD }
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
        : sealProposal(actor.core.sealer, actor.userId, proposal),
    transcript: heard.text,
  };
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
