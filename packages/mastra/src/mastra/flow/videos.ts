import { billingCatalog } from "@wovain/billing/catalog";
import { EVENTS } from "@wovain/core/events";
import { videoAdInput, videoUrlOf } from "@wovain/core/video-ads";
import type { AdVideo, VideoAspect } from "@wovain/core/video-ads";
import { product } from "@wovain/db/schema/seller";
import { and, eq } from "drizzle-orm";
import { log } from "evlog";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { getDesign } from "./designs";
import { once } from "./once";
import { charge } from "./spend";

// Video ad creatives (openspec video-ad-creatives): once a product is live,
// fal animates its mockup into short clips on wovain's own fal key (FAL_KEY),
// each paid by the `video` credits. The Inngest function in
// ../workflows/videos.ts runs one clip per step; the submit is keyed, so a
// retry polls the same fal request and never charges twice. A clip that
// fails for good is logged and left out: the campaign still launches with
// images.

// On where the environment sets a video model, prices the step and has
// wovain's fal key.
export const videoAdsOn = (actor: Actor) =>
  actor.core.videoModel !== undefined &&
  actor.core.falKey !== undefined &&
  billingCatalog().creditCost.video !== undefined;

const setupOf = (actor: Actor) => {
  const { falKey, videoModel } = actor.core;
  if (falKey === undefined || videoModel === undefined) {
    throw new Error("Video ads are off in this environment");
  }
  return { jobs: actor.core.falJobs(falKey), model: videoModel };
};

export const logVideoFailure = (
  actor: Actor,
  {
    aspect,
    error,
    productId,
  }: { aspect?: VideoAspect; error: unknown; productId: string }
) => {
  const message = error instanceof Error ? error.message : String(error);
  log.error({
    error: {
      code: "VIDEO_AD_FAILED",
      message: `A video ad clip failed: ${message}`,
      name: "VideoAdFailed",
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
    userId: actor.userId,
    video: { aspect: aspect ?? null, productId },
  });
};

// Asks for a live product's clips, once per product (Inngest drops a repeat
// of the same event id).
export const requestProductVideos = async (actor: Actor, productId: string) => {
  if (!videoAdsOn(actor)) {
    return;
  }
  try {
    await actor.events?.send({
      data: { productId, userId: actor.userId },
      id: `product-videos:${productId}`,
      name: EVENTS.productVideos,
    });
  } catch (error) {
    // The product is live already: the clips are extra.
    logVideoFailure(actor, { error, productId });
  }
};

// Queues one clip on fal, charged once: fal's request ID is kept under the
// key, so a retry gets it back without paying again.
export const submitProductVideo = async (
  actor: Actor,
  productId: string,
  aspect: VideoAspect
) => {
  // Read here, not through ./products, which asks for the clips.
  const row = await actor.db.query.product.findFirst({
    where: { id: productId, userId: actor.userId },
  });
  if (row === undefined) {
    throw notFound.product({ id: productId });
  }
  const source = await getDesign(actor, row.designId);
  const imageUrl = row.mockups[0] ?? source.artworkUrl;
  const { jobs, model } = setupOf(actor);
  return await once(actor, {
    key: `video:${productId}:${aspect}:submit`,
    operation: "submit_video",
    perform: async () =>
      await charge(
        actor,
        "video",
        { runId: source.runId },
        async () => await jobs.submit(model, videoAdInput(imageUrl, aspect))
      ),
    provider: "fal",
    runId: source.runId,
  });
};

// Waits for a queued clip and returns its URL; a re-read is free.
export const productVideoUrl = async (actor: Actor, requestId: string) => {
  const { jobs, model } = setupOf(actor);
  return videoUrlOf(await jobs.result(model, requestId));
};

export const saveProductVideos = async (
  { db, userId }: Actor,
  productId: string,
  videos: AdVideo[]
) => {
  await db
    .update(product)
    .set({ videos })
    .where(and(eq(product.id, productId), eq(product.userId, userId)));
  return videos.length;
};
