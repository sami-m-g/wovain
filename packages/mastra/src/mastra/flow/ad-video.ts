import { billingCatalog } from "@wovain/billing/catalog";
import { releaseCredits, reserveCredits } from "@wovain/billing/credits";
import {
  adConceptSchema,
  adVideoUrlOf,
  captionsInput,
  castConcept,
  castInput,
  directorPrompt,
  directorSystem,
  feedCutInput,
  filmInput,
  frameInput,
  imageUrlOf,
  REVIEWER_RULES,
  reviewPassed,
  reviewPrompt,
  reviewSchema,
  srtOf,
} from "@wovain/core/ad-video";
import type { AdConcept, AdEvidence, AdReview } from "@wovain/core/ad-video";
import type { AdVideo } from "@wovain/core/video-ads";
import { externalWrite } from "@wovain/db/schema/durable";
import { product } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { log } from "evlog";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { withAgentTrace } from "./agent-trace";
import { getDesign } from "./designs";
import { getIdea } from "./ideas";
import { once } from "./once";
import { settleHeld } from "./spend";

// Director-made video ads (openspec director-video-ads): the stages the
// ad-video workflow (../workflows/ad-video.ts) runs, one per step. Every
// paid fal call is keyed by product, attempt and stage, so a retried step
// reads the same fal request back and never pays twice; reading a result is
// free. The ad's credits are held once when it starts and spent only when
// it is saved.

// The first cut, then the one redo the Reviewer may ask for.
export type Attempt = 0 | 1;

// On where the environment sets the models, prices the ad and has wovain's
// fal key.
export const adVideoOn = (actor: Actor) =>
  actor.core.adVideoModels !== undefined &&
  actor.core.falKey !== undefined &&
  billingCatalog().creditCost.adVideo !== undefined;

const setupOf = (actor: Actor) => {
  const { adVideoModels, falKey } = actor.core;
  if (adVideoModels === undefined || falKey === undefined) {
    throw new Error("Director-made video ads are off in this environment");
  }
  return { jobs: actor.core.falJobs(falKey), models: adVideoModels };
};

const keyOf = (productId: string, attempt: Attempt, stage: string) =>
  `ad-video:${productId}:${attempt}:${stage}`;
const holdKey = (productId: string) => `ad-video:${productId}:hold`;

export const logAdVideoFailure = (
  actor: Actor,
  {
    error,
    productId,
    stage,
  }: { error: unknown; productId: string; stage: string }
) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error({
    adVideo: { productId, stage },
    error: {
      code: "AD_VIDEO_FAILED",
      message: `A video ad failed at ${stage}: ${message}`,
      name: "AdVideoFailed",
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
    userId: actor.userId,
  });
};

// What the ad is made from: the live product's mockup and art, and the
// drop's evidence (the idea's Qloo buyers, why now, its words and tone).
export interface AdSources {
  artworkUrl: string;
  evidence: AdEvidence;
  mockupUrl: string;
  runId: string | null;
}

export const adSources = async (
  actor: Actor,
  productId: string
): Promise<AdSources> => {
  const row = await actor.db.query.product.findFirst({
    where: { id: productId, userId: actor.userId },
  });
  if (row === undefined) {
    throw notFound.product({ id: productId });
  }
  const source = await getDesign(actor, row.designId);
  const found = await getIdea(actor, source.ideaId);
  const { words } = found.research;
  const spoken = words?.status === "ok" ? words : undefined;
  const buyers = found.whoBuys?.buyers;
  return {
    artworkUrl: source.artworkUrl,
    evidence: {
      audience: {
        age: buyers?.age,
        audiences: (found.whoBuys?.audiences ?? [])
          .slice(0, 5)
          .map((audience) => audience.name),
        gender: buyers?.gender,
      },
      idea: {
        buyer: spoken?.buyer,
        concept: spoken?.concept,
        occasion: spoken?.occasion,
        theme: found.theme,
      },
      product: {
        description: source.brief.description,
        title: source.brief.title,
      },
      tone: found.style?.tone?.label,
      whyNow: spoken?.whyNow ?? found.research.moment,
    },
    mockupUrl: row.mockups[0] ?? source.artworkUrl,
    runId: source.runId,
  };
};

// The ad's credits, held once however often the step runs. Undefined when
// the merchant can't afford it: no ad, and the campaign runs images.
export const holdAdCredits = async (
  actor: Actor,
  productId: string,
  runId: string | null
) => {
  const held = await once(actor, {
    key: holdKey(productId),
    operation: "hold_ad_video",
    perform: async () =>
      await reserveCredits(actor.db, {
        runId,
        step: "adVideo",
        userId: actor.userId,
      }),
    provider: "fal",
    runId,
  });
  if (!held.ok) {
    actor.log?.set({
      adVideo: { available: held.available, needed: held.needed, productId },
    });
    return;
  }
  return { available: held.available, id: held.id };
};

export const settleAdCredits = async (
  actor: Actor,
  held: { available: number; id: string },
  runId: string | null
) => {
  await settleHeld(actor, "adVideo", { ...held, runId });
};

// Gives back what the ad held, if it held anything; a repeat gives nothing.
export const releaseHeldAd = async (actor: Actor, productId: string) => {
  const [row] = await actor.db
    .select({ result: externalWrite.result })
    .from(externalWrite)
    .where(
      and(
        eq(externalWrite.key, holdKey(productId)),
        eq(externalWrite.userId, actor.userId)
      )
    );
  const held = row?.result as { id?: string; ok?: boolean } | null | undefined;
  if (held?.ok === true && held.id !== undefined) {
    await releaseCredits(actor.db, held.id);
  }
};

// The Director's concept, kept with its key: a retry gets the same one.
// On the redo it rewrites the last concept with the Reviewer's fixes.
export const directAd = async (
  actor: Actor,
  {
    attempt,
    productId,
    revision,
    sources,
  }: {
    attempt: Attempt;
    productId: string;
    revision?: { fixes: string[]; previous: AdConcept } | undefined;
    sources: AdSources;
  }
) =>
  await once(actor, {
    key: keyOf(productId, attempt, "concept"),
    operation: "ad_director",
    perform: async () =>
      await withAgentTrace(
        actor,
        { runId: sources.runId, traceId: sources.runId ?? productId },
        async () => {
          const concept = await actor.core.nemotron({
            // Every word a buyer reads must come from the evidence.
            grounded: (reply) =>
              [
                reply.hook,
                reply.cta,
                reply.sound.line,
                ...reply.shots.map((shot) => shot.text),
              ].join("\n"),
            log: actor.log,
            name: "ad_director",
            prompt: directorPrompt(sources.evidence, revision),
            schema: adConceptSchema,
            system: directorSystem(revision !== undefined),
            temperature: 0.8,
          });
          return castConcept(concept, sources.evidence.audience);
        }
      ),
    provider: "nebius",
    runId: sources.runId,
  });

// One keyed fal job: submitted once, its result read as often as needed.
const falOnce = async (
  actor: Actor,
  {
    input,
    key,
    model,
    operation,
    runId,
  }: {
    input: Record<string, unknown>;
    key: string;
    model: string;
    operation: string;
    runId: string | null;
  }
) => {
  const { jobs } = setupOf(actor);
  const requestId = await once(actor, {
    key,
    operation,
    perform: async () => await jobs.submit(model, input),
    provider: "fal",
    runId,
  });
  return await jobs.result(model, requestId);
};

// The cast still: a person matching the buyers, in the actual shirt.
export const castAd = async (
  actor: Actor,
  {
    attempt,
    concept,
    productId,
    sources,
  }: {
    attempt: Attempt;
    concept: AdConcept;
    productId: string;
    sources: AdSources;
  }
) =>
  imageUrlOf(
    await falOnce(actor, {
      input: castInput(sources, concept),
      key: keyOf(productId, attempt, "cast"),
      model: setupOf(actor).models.cast,
      operation: "cast_ad_video",
      runId: sources.runId,
    })
  );

// The film: one take from the cast still, with native audio.
export const filmAd = async (
  actor: Actor,
  {
    attempt,
    castUrl,
    concept,
    productId,
    runId,
  }: {
    attempt: Attempt;
    castUrl: string;
    concept: AdConcept;
    productId: string;
    runId: string | null;
  }
) =>
  adVideoUrlOf(
    await falOnce(actor, {
      input: filmInput(castUrl, concept),
      key: keyOf(productId, attempt, "film"),
      model: setupOf(actor).models.film,
      operation: "film_ad_video",
      runId,
    })
  );

// The two finished cuts: the 4:5 crop of the film, then the captions
// burned into each.
export const finishAd = async (
  actor: Actor,
  {
    attempt,
    concept,
    filmUrl,
    productId,
    runId,
  }: {
    attempt: Attempt;
    concept: AdConcept;
    filmUrl: string;
    productId: string;
    runId: string | null;
  }
) => {
  const { models } = setupOf(actor);
  const feedUrl = adVideoUrlOf(
    await falOnce(actor, {
      input: feedCutInput(filmUrl),
      key: keyOf(productId, attempt, "feed"),
      model: models.resize,
      operation: "crop_ad_video",
      runId,
    })
  );
  const srt = srtOf(concept);
  const caption = async (cut: "feed" | "tall", url: string) =>
    adVideoUrlOf(
      await falOnce(actor, {
        input: captionsInput(url, srt),
        key: keyOf(productId, attempt, `captions-${cut}`),
        model: models.captions,
        operation: "caption_ad_video",
        runId,
      })
    );
  const [tall, feed] = await Promise.all([
    caption("tall", filmUrl),
    caption("feed", feedUrl),
  ]);
  return { feed, tall };
};

const FRAMES = ["first", "middle", "last"] as const;

// The Reviewer's verdict on the finished 9:16 cut, from the art, the cast
// still and three of its frames.
export const reviewAd = async (
  actor: Actor,
  {
    attempt,
    castUrl,
    concept,
    productId,
    sources,
    tallUrl,
  }: {
    attempt: Attempt;
    castUrl: string;
    concept: AdConcept;
    productId: string;
    sources: AdSources;
    tallUrl: string;
  }
): Promise<AdReview & { passed: boolean }> => {
  const { models } = setupOf(actor);
  const frames = await Promise.all(
    FRAMES.map(async (frame) =>
      imageUrlOf(
        await falOnce(actor, {
          input: frameInput(tallUrl, frame),
          key: keyOf(productId, attempt, `frame-${frame}`),
          model: models.frame,
          operation: "frame_ad_video",
          runId: sources.runId,
        })
      )
    )
  );
  const review = await once(actor, {
    key: keyOf(productId, attempt, "review"),
    operation: "ad_video_review",
    perform: async () =>
      await withAgentTrace(
        actor,
        { runId: sources.runId, traceId: sources.runId ?? productId },
        async () =>
          await actor.core.nemotron({
            images: [sources.artworkUrl, castUrl, ...frames],
            log: actor.log,
            name: "ad_video_review",
            prompt: reviewPrompt(concept),
            schema: reviewSchema,
            system: REVIEWER_RULES,
            temperature: 0,
          })
      ),
    provider: "nebius",
    runId: sources.runId,
  });
  return { ...review, passed: reviewPassed(review) };
};

// The finished ad on the product: both cuts, its model AI-generated.
export const saveAdVideos = async (
  { db, userId }: Actor,
  productId: string,
  cuts: { feed: string; tall: string }
) => {
  const videos: AdVideo[] = [
    { aiModel: true, aspect: "9:16", url: cuts.tall },
    { aiModel: true, aspect: "4:5", url: cuts.feed },
  ];
  await db
    .update(product)
    .set({ videos })
    .where(and(eq(product.id, productId), eq(product.userId, userId)));
  return videos.length;
};
