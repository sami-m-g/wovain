import {
  learnFromResults,
  requireFeedbackLoop,
  whatWeLearned,
} from "../flow/feedback";
import { protectedProcedure } from "../index";

// The feedback loop: what wovain learned from the merchant's sales and ads,
// and a fresh snapshot and fit on demand. Behind the feedback-loop flag.
export const feedbackRouter = {
  learn: protectedProcedure.handler(async ({ context }) => {
    await requireFeedbackLoop(context);
    await learnFromResults(context);
    return await whatWeLearned(context);
  }),
  learned: protectedProcedure.handler(async ({ context }) => {
    await requireFeedbackLoop(context);
    return await whatWeLearned(context);
  }),
};
