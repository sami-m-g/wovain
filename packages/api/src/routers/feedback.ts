import {
  learnOnDemand,
  requireFeedbackLoop,
  whatWeLearned,
} from "../flow/feedback";
import { protectedProcedure } from "../index";

// The feedback loop: what wovain learned from the merchant's sales and ads,
// and a fresh snapshot and fit on demand (at most one every few minutes).
// Behind the feedback-loop flag.
export const feedbackRouter = {
  learn: protectedProcedure.handler(async ({ context }) => {
    await requireFeedbackLoop(context);
    return await learnOnDemand(context);
  }),
  learned: protectedProcedure.handler(async ({ context }) => {
    await requireFeedbackLoop(context);
    return await whatWeLearned(context);
  }),
};
