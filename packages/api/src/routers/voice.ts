import { call } from "@orpc/server";
import { MAX_AUDIO_BASE64, VOICE_SCREENS } from "@wovain/core/voice";
import type { VoiceProposal } from "@wovain/core/voice";
import { z } from "zod";

import type { Context } from "../context";
import {
  confirmVoiceProposal,
  dictateClip,
  proposeVoiceCommand,
  requireVoice,
  voiceEnabled,
} from "../flow/voice";
import { protectedProcedure } from "../index";
import { approvalsRouter } from "./approvals";
import { designsRouter, runsRouter } from "./seller";

// Voice commands (openspec voice-commands), behind the voice-input flag:
// `command` turns a clip into a proposal and changes nothing; `confirm` runs
// the proposal through the very procedure its button calls, with the same
// checks, billing, funnel events and errors.

const id = z.string().min(1).max(64);

// The run each confirmed action belongs to, so a client can open it.
const execute = async (
  proposal: VoiceProposal,
  context: Context
): Promise<{ runId: string | null }> => {
  switch (proposal.kind) {
    case "start_drop": {
      const started = await call(
        runsRouter.start,
        { seed: proposal.brief },
        { context }
      );
      return { runId: started.id };
    }
    case "approve_ideas": {
      await call(
        runsRouter.approveIdeas,
        { id: proposal.runId, ideaIds: proposal.ideaIds },
        { context }
      );
      return { runId: proposal.runId };
    }
    case "approve_design": {
      const decided = await call(
        designsRouter.approve,
        { id: proposal.designId },
        { context }
      );
      return { runId: decided.runId };
    }
    case "reject_design": {
      const decided = await call(
        designsRouter.reject,
        { id: proposal.designId, reason: proposal.reason },
        { context }
      );
      return { runId: decided.runId };
    }
    case "decide_approval": {
      const decided = await call(
        approvalsRouter.decide,
        {
          approvalId: proposal.approvalId,
          approve: proposal.approve,
          note: proposal.note,
        },
        { context }
      );
      return { runId: decided.runId ?? null };
    }
    default: {
      throw new Error("Nothing to confirm");
    }
  }
};

const clipInput = z.object({
  audio: z.string().min(1).max(MAX_AUDIO_BASE64),
  mimeType: z.string().min(1).max(100),
});

export const voiceRouter = {
  command: protectedProcedure
    .input(
      z.object({
        audio: z.string().min(1).max(MAX_AUDIO_BASE64),
        mimeType: z.string().min(1).max(100),
        runId: id.optional(),
        screen: z.enum(VOICE_SCREENS),
      })
    )
    .handler(
      async ({ context, input }) => await proposeVoiceCommand(context, input)
    ),
  confirm: protectedProcedure
    .input(z.object({ token: z.string().min(1).max(8192) }))
    .handler(async ({ context, input }) => {
      await requireVoice(context);
      // Refuses a token that was already confirmed (409), before any work.
      const proposal = await confirmVoiceProposal(context, input.token);
      const done = await execute(proposal, context);
      await context.analytics?.capture({
        distinctId: context.userId,
        event: "voice_command_confirmed",
        properties: { intent: proposal.kind },
      });
      return { kind: proposal.kind, ...done };
    }),
  // Dictation into a text field (openspec voice-dictation): a clip becomes
  // text for the merchant to edit. Changes nothing and runs nothing.
  dictate: protectedProcedure
    .input(clipInput)
    .handler(async ({ context, input }) => await dictateClip(context, input)),
  // Whether this merchant has voice: the clients show the mic only then.
  status: protectedProcedure.handler(async ({ context }) => ({
    enabled: await voiceEnabled(context),
  })),
};
