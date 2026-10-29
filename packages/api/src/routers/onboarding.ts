import { answersSchema } from "@wovain/core/brand-discovery";
import {
  buyers,
  discover,
  recolour,
  searchTaste,
} from "@wovain/mastra/flow/brand-discovery";
import {
  finishOnboarding,
  onboardingStatus,
  resolveBrandReferences,
  saveBrand,
} from "@wovain/mastra/flow/onboarding";
import {
  MAX_REFERENCES,
  MIN_REFERENCES,
} from "@wovain/mastra/memory/brand-identity";
import { z } from "zod";

import { protectedProcedure } from "../index";

// The first-run wizard (openspec onboarding-wizard). `status` answers
// `{ enabled: false }` while the onboarding-wizard flag is off, so the app
// can hide the wizard; the other procedures answer 404 then. saveBrand takes
// no Qloo entities: the server resolves the references itself.

const reference = z.string().trim().min(1).max(120);
const MAX_PALETTE = 6;
const MAX_NICHES = 8;
const HEX = /^#[\da-f]{6}$/iu;

const discoverInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("auto"),
    round: z.number().int().min(0).max(1000),
  }),
  z.object({
    answers: answersSchema.refine(
      (answers) => answers.audiences.length > 0 || answers.loves.length > 0,
      { message: "Pick at least one interest or one thing you love" }
    ),
    mode: z.literal("questions"),
  }),
  z.object({
    mode: z.literal("references"),
    references: z.array(reference).min(1).max(MAX_REFERENCES),
  }),
]);

export const onboardingRouter = {
  buyers: protectedProcedure
    .input(
      z.object({ references: z.array(reference).min(1).max(MAX_REFERENCES) })
    )
    .handler(
      async ({ context, input }) => await buyers(context, input.references)
    ),
  discover: protectedProcedure
    .input(discoverInput)
    .handler(async ({ context, input }) => await discover(context, input)),
  finish: protectedProcedure.handler(
    async ({ context }) => await finishOnboarding(context)
  ),
  // Colour sets from plain words ("warmer", "rust and cream").
  recolour: protectedProcedure
    .input(
      z.object({
        current: z.array(z.string().regex(HEX)).max(MAX_PALETTE).optional(),
        niche: z.string().trim().max(60).optional(),
        words: z.string().trim().min(2).max(80),
      })
    )
    .handler(async ({ context, input }) => await recolour(context, input)),
  resolveReferences: protectedProcedure
    .input(
      z.object({
        references: z.array(reference).min(1).max(MAX_REFERENCES),
      })
    )
    .handler(
      async ({ context, input }) =>
        await resolveBrandReferences(context, input.references)
    ),
  saveBrand: protectedProcedure
    .input(
      z.object({
        displayName: z.string().trim().max(80).optional(),
        niches: z.array(z.string().trim().min(1).max(60)).max(MAX_NICHES),
        palette: z.array(z.string().regex(HEX).toUpperCase()).max(MAX_PALETTE),
        tasteReferences: z
          .array(reference)
          .min(MIN_REFERENCES)
          .max(MAX_REFERENCES),
        voice: z.string().trim().max(200).optional(),
      })
    )
    .handler(async ({ context, input }) => await saveBrand(context, input)),
  searchTaste: protectedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(80) }))
    .handler(
      async ({ context, input }) => await searchTaste(context, input.query)
    ),
  status: protectedProcedure.handler(
    async ({ context }) => await onboardingStatus(context)
  ),
};
