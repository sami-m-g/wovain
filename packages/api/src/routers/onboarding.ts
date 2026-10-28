import { MAX_REFERENCES, MIN_REFERENCES } from "@wovain/core/brand-identity";
import { z } from "zod";

import {
  onboardingStatus,
  resolveBrandReferences,
  saveBrand,
} from "../flow/onboarding";
import { protectedProcedure } from "../index";

// The first-run wizard (openspec onboarding-wizard). `status` answers
// `{ enabled: false }` while the onboarding-wizard flag is off, so the app
// can hide the wizard; the other procedures answer 404 then.

const reference = z.string().trim().min(1).max(120);
const MAX_PALETTE = 6;
const MAX_NICHES = 8;
const MAX_ENTITIES = 30;
const HEX = /^#[\da-f]{6}$/iu;

const entity = z.object({
  from: z.string().max(120).optional(),
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(300),
  score: z.number().min(0).max(1).optional(),
  type: z.string().max(100),
});

export const onboardingRouter = {
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
        qlooEntities: z.array(entity).max(MAX_ENTITIES),
        tasteReferences: z
          .array(reference)
          .min(MIN_REFERENCES)
          .max(MAX_REFERENCES),
        voice: z.string().trim().max(200).optional(),
      })
    )
    .handler(async ({ context, input }) => await saveBrand(context, input)),
  status: protectedProcedure.handler(
    async ({ context }) => await onboardingStatus(context)
  ),
};
