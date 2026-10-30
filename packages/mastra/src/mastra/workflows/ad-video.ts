import { init } from "@mastra/inngest";
import { adConceptSchema } from "@wovain/core/ad-video";
import type { AdReview } from "@wovain/core/ad-video";
import { NonRetriableError } from "inngest";
import type { Inngest } from "inngest";
import { z } from "zod";

import type { Actor } from "../flow/actor";
import {
  adSources,
  castAd,
  directAd,
  filmAd,
  finishAd,
  holdAdCredits,
  logAdVideoFailure,
  releaseHeldAd,
  reviewAd,
  saveAdVideos,
  settleAdCredits,
} from "../flow/ad-video";
import type { AdSources, Attempt } from "../flow/ad-video";
import { isPermanent } from "./run";
import type { RunServices } from "./run";

// A live product's director-made video ad (openspec director-video-ads), as
// a Mastra workflow on Inngest: hold the credits, the Director's concept,
// the cast, the film, the two captioned cuts and the Reviewer's verdict;
// then, when the Reviewer failed it, the same once more from the Director's
// revised concept (the redo steps pass through when the first cut passed),
// and the save. Each step is memoized by Inngest and each paid call keyed
// (../flow/ad-video), so a retry never pays twice. A rejected or failed ad
// gives its credits back and is logged at error level; the campaign runs
// the image ads.

export const AD_VIDEO_WORKFLOW_ID = "ad-video";

const trigger = z.object({ productId: z.string(), userId: z.string() });
export type AdVideoInput = z.infer<typeof trigger>;

const carry = trigger.extend({
  attempt: z.union([z.literal(0), z.literal(1)]),
  castUrl: z.string().optional(),
  concept: adConceptSchema.optional(),
  cuts: z.object({ feed: z.string(), tall: z.string() }).optional(),
  filmUrl: z.string().optional(),
  held: z.object({ available: z.number(), id: z.string() }),
  review: z.custom<AdReview & { passed: boolean }>().optional(),
  sources: z.custom<AdSources>(),
});
type Carry = z.infer<typeof carry>;

const RETRIES = 3;
const RETRY_DELAY_MS = 10_000;
const FUNCTION_RETRIES = 4;
// Ads made at once per merchant; others' go on.
const ADS_PER_MERCHANT = 2;

const missing = (what: string) =>
  new NonRetriableError(`The video ad has no ${what} yet`);

const need = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) {
    throw missing(what);
  }
  return value;
};

// A 4xx won't pass on a retry: fail the step now.
const guarded =
  <I, O>(work: (input: I) => Promise<O>) =>
  async (input: I) => {
    try {
      return await work(input);
    } catch (error) {
      if (isPermanent(error)) {
        throw new NonRetriableError(
          error instanceof Error ? error.message : String(error),
          { cause: error }
        );
      }
      throw error;
    }
  };

export const createAdVideoWorkflow = (
  inngest: Inngest,
  services: RunServices
) => {
  const { createStep, createWorkflow } = init(inngest);
  const actorFor = (userId: string): Actor => ({ ...services, userId });

  const step = (
    id: string,
    work: (actor: Actor, from: Carry) => Promise<Carry>,
    // The attempt the step belongs to; it passes the others through.
    attempt?: Attempt
  ) =>
    createStep({
      execute: async ({ inputData }) =>
        // An ad with no credits held makes nothing (hold bails the run; this
        // keeps a later step from paying even so), and a redo step passes
        // the first cut through.
        inputData.held.id === "" ||
        (attempt !== undefined && inputData.attempt !== attempt)
          ? inputData
          : await guarded(
              async (from: Carry) => await work(actorFor(from.userId), from)
            )(inputData),
      id,
      inputSchema: carry,
      outputSchema: carry,
      retries: RETRIES,
    });

  // Holds the ad's credits; a merchant who can't afford it gets no ad.
  const hold = createStep({
    execute: async ({ bail, inputData }) =>
      await guarded(async (input: z.infer<typeof trigger>) => {
        const actor = actorFor(input.userId);
        const sources = await adSources(actor, input.productId);
        const held = await holdAdCredits(actor, input.productId, sources.runId);
        if (held === undefined) {
          return bail({
            ...input,
            attempt: 0 as const,
            held: { available: 0, id: "" },
            sources,
          });
        }
        return { ...input, attempt: 0 as const, held, sources };
      })(inputData),
    id: "hold",
    inputSchema: trigger,
    outputSchema: carry,
    retries: RETRIES,
  });

  const direct = step("direct", async (actor, from) => ({
    ...from,
    concept: await directAd(actor, {
      attempt: 0,
      productId: from.productId,
      sources: from.sources,
    }),
  }));

  const castFor = (attempt: Attempt) =>
    step(
      attempt === 0 ? "cast" : "recast",
      async (actor, from) => ({
        ...from,
        castUrl: await castAd(actor, {
          attempt,
          concept: need(from.concept, "concept"),
          productId: from.productId,
          sources: from.sources,
        }),
      }),
      attempt
    );

  const filmFor = (attempt: Attempt) =>
    step(
      attempt === 0 ? "film" : "refilm",
      async (actor, from) => ({
        ...from,
        filmUrl: await filmAd(actor, {
          attempt,
          castUrl: need(from.castUrl, "cast"),
          concept: need(from.concept, "concept"),
          productId: from.productId,
          runId: from.sources.runId,
        }),
      }),
      attempt
    );

  const finishFor = (attempt: Attempt) =>
    step(
      attempt === 0 ? "finish" : "refinish",
      async (actor, from) => ({
        ...from,
        cuts: await finishAd(actor, {
          attempt,
          concept: need(from.concept, "concept"),
          filmUrl: need(from.filmUrl, "film"),
          productId: from.productId,
          runId: from.sources.runId,
        }),
      }),
      attempt
    );

  const reviewFor = (attempt: Attempt) =>
    step(
      attempt === 0 ? "review" : "rereview",
      async (actor, from) => ({
        ...from,
        review: await reviewAd(actor, {
          attempt,
          castUrl: need(from.castUrl, "cast"),
          concept: need(from.concept, "concept"),
          productId: from.productId,
          sources: from.sources,
          tallUrl: need(from.cuts, "cut").tall,
        }),
      }),
      attempt
    );

  // The one redo: the Director rewrites the concept with the Reviewer's
  // fixes. A passed first cut goes straight on.
  const revise = step("revise", async (actor, from) => {
    const review = need(from.review, "review");
    if (review.passed) {
      return from;
    }
    const concept = await directAd(actor, {
      attempt: 1,
      productId: from.productId,
      revision: {
        fixes: review.fixes,
        previous: need(from.concept, "concept"),
      },
      sources: from.sources,
    });
    return { ...from, attempt: 1 as const, concept };
  });

  // A passed ad is saved and its credits spent; a rejected one gives them
  // back and is logged, and the campaign runs the image ads.
  const save = step("save", async (actor, from) => {
    const review = need(from.review, "review");
    if (!review.passed) {
      await releaseHeldAd(actor, from.productId);
      logAdVideoFailure(actor, {
        error: new Error(
          `The reviewer rejected the redo: ${review.fixes.join("; ")}`
        ),
        productId: from.productId,
        stage: "review",
      });
      return from;
    }
    // Spent before it is saved: a settled hold can't be released, so a
    // failure after this never gives a saved ad away for free.
    await settleAdCredits(actor, from.held, from.sources.runId);
    await saveAdVideos(actor, from.productId, need(from.cuts, "cut"));
    return from;
  });

  return (
    createWorkflow({
      concurrency: { key: "event.data.resourceId", limit: ADS_PER_MERCHANT },
      id: AD_VIDEO_WORKFLOW_ID,
      inputSchema: trigger,
      options: {
        // On Inngest this runs in the workflow's memoized finalize step.
        onError: async ({ error, getInitData }) => {
          const { productId, userId } = trigger.parse(getInitData());
          const actor = actorFor(userId);
          await releaseHeldAd(actor, productId);
          logAdVideoFailure(actor, { error, productId, stage: "workflow" });
        },
      },
      outputSchema: carry,
      retries: FUNCTION_RETRIES,
      retryConfig: { attempts: RETRIES, delay: RETRY_DELAY_MS },
    })
      /* oxlint-disable promise/prefer-await-to-then -- Mastra's step builder, not a promise */
      .then(hold)
      .then(direct)
      .then(castFor(0))
      .then(filmFor(0))
      .then(finishFor(0))
      .then(reviewFor(0))
      .then(revise)
      .then(castFor(1))
      .then(filmFor(1))
      .then(finishFor(1))
      .then(reviewFor(1))
      .then(save)
      /* oxlint-enable promise/prefer-await-to-then */
      .commit()
  );
};

export type AdVideoWorkflow = ReturnType<typeof createAdVideoWorkflow>;
