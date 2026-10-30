import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { creditBalance } from "@wovain/billing/credits";
import { applyGrant } from "@wovain/billing/mirror";
import { createBilling } from "@wovain/billing/service";
import type { AdVideoModels } from "@wovain/core/ad-video";
import { createFalJobs } from "@wovain/core/fal";
import { fakeAgents } from "@wovain/core/test-doubles";
import type { ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { design, idea, product } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

import type { Core } from "../services";
import type { Actor } from "./actor";
import {
  adSources,
  castAd,
  directAd,
  filmAd,
  finishAd,
  holdAdCredits,
  releaseHeldAd,
  reviewAd,
  saveAdVideos,
  settleAdCredits,
} from "./ad-video";
import type { Attempt } from "./ad-video";

// Director-made video ads on real Postgres (PGlite, with the app's
// migrations), a fake fal and fake agents: the stages the ad-video workflow
// runs, in its order. A retried stage pays and charges once, the Reviewer's
// fixes reach the Director once, and a failed ad gives its credits back.
// Nothing reaches fal or Nebius.

const MIGRATIONS = fileURLToPath(
  new URL("../../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const MOCKUP = "https://cdn.test/mockup.png";
const ART = "https://cdn.test/art.png";
const MODELS: AdVideoModels = {
  captions: "fal/captions",
  cast: "fal/cast",
  film: "fal/film",
  frame: "fal/frame",
  resize: "fal/resize",
};

const CONCEPT = {
  angle: "Night-shift pride",
  cast: {
    age: "30 to 34",
    gender: "man",
    look: "short curls",
    setting: "a diner at night",
  },
  cta: "Shop the drop",
  hook: "For the night shift",
  shots: [
    { action: "Push-in", seconds: 3, text: "" },
    { action: "Walk", seconds: 6, text: "Wear it loud" },
    { action: "Close-up on the print", seconds: 6, text: "" },
  ],
  sound: { ambient: "diner chatter", line: "", music: "lo-fi beat" },
};
const OK = { note: "fine", pass: true };
const PASS = {
  checks: { design: OK, hook: OK, policy: OK, product: OK, text: OK },
  fixes: [],
};
const FAIL = {
  ...PASS,
  checks: { ...PASS.checks, design: { note: "print warped", pass: false } },
  fixes: ["Keep the print flat and facing the camera in shot 3"],
};

const fakeFal = () => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    if (tool === "submit_job") {
      return await Promise.resolve({ request_id: `req-${calls.length}` });
    }
    if (tool === "check_job") {
      return await Promise.resolve({ status: "COMPLETED" });
    }
    const id = String(args.request_id);
    const endpoint = String(args.endpoint_id);
    return await Promise.resolve(
      endpoint === MODELS.cast || endpoint === MODELS.frame
        ? { images: [{ url: `https://fal.test/${id}.png` }] }
        : { video: { url: `https://fal.test/${id}.mp4` } }
    );
  };
  const submits = () => calls.filter((one) => one.tool === "submit_job");
  return { call, calls, submits };
};

const setup = async ({
  credits = 100,
  reviews = [PASS],
}: { credits?: number; reviews?: unknown[] } = {}) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "merchant@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Merchant",
  });
  await applyGrant(db as unknown as Database, {
    grantId: "grant_plan",
    periodKey: "2026-10-01T00:00:00Z",
    rollover: false,
    source: "plan",
    units: credits,
    userId: USER_ID,
  });
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {
        moment: "Night-shift workers trend on TikTok",
        words: {
          buyer: "Nurses on night shifts",
          concept: "A neon diner crest",
          occasion: "After a shift",
          status: "ok",
          style: "retro",
          title: "Night Shift Diner",
          whyNow: "Night-shift pride is rising",
        },
      } as never,
      score: 80,
      seed: "night shift",
      theme: "Night shift",
      userId: USER_ID,
      whoBuys: {
        audiences: [{ affinity: 0.9, id: "a1", name: "Healthcare workers" }],
        brands: [],
        buyers: { age: "30_to_34", gender: "female" },
        location: "US",
        places: [],
      },
    })
    .returning();
  const [drawn] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: ART,
      artworkWidth: 10,
      brief: {
        description: "A neon diner crest.",
        title: "Night Shift",
      } as never,
      ideaId: found?.id ?? "",
      judgment: {} as never,
      userId: USER_ID,
    })
    .returning();
  const [made] = await db
    .insert(product)
    .values({
      catalogProductId: "cp",
      customizationId: "cu",
      designId: drawn?.id ?? "",
      mediaUri: "m",
      mockups: [MOCKUP],
      offerId: "o",
      price: 25,
      userId: USER_ID,
    })
    .returning();
  const fal = fakeFal();
  const agents = fakeAgents({
    ad_director: [CONCEPT],
    ad_video_review: reviews,
  });
  const actor = {
    billing: createBilling({
      BETTER_AUTH_URL: "http://localhost:3000",
      POLAR_ENVIRONMENT: "sandbox",
    }),
    core: {
      adVideoModels: MODELS,
      falJobs: (call: ToolCall) => createFalJobs(call),
      falKey: fal.call,
      flags: { isOn: async () => await Promise.resolve(false) },
      nemotron: agents.ask,
    } as unknown as Core,
    db: db as unknown as Database,
    userId: USER_ID,
  } as unknown as Actor;
  const balance = async () => {
    const { available } = await creditBalance(
      db as unknown as Database,
      USER_ID
    );
    return available;
  };
  return { actor, agents, balance, db, fal, productId: made?.id ?? "" };
};

type Ctx = Awaited<ReturnType<typeof setup>>;

// One attempt's stages, as the workflow's steps run them.
const makeCut = async (
  { actor, productId }: Ctx,
  attempt: Attempt,
  revision?: { fixes: string[]; previous: typeof CONCEPT }
) => {
  const sources = await adSources(actor, productId);
  const concept = await directAd(actor, {
    attempt,
    productId,
    revision: revision as never,
    sources,
  });
  const castUrl = await castAd(actor, { attempt, concept, productId, sources });
  const filmUrl = await filmAd(actor, {
    attempt,
    castUrl,
    concept,
    productId,
    runId: sources.runId,
  });
  const cuts = await finishAd(actor, {
    attempt,
    concept,
    filmUrl,
    productId,
    runId: sources.runId,
  });
  const review = await reviewAd(actor, {
    attempt,
    castUrl,
    concept,
    productId,
    sources,
    tallUrl: cuts.tall,
  });
  return { concept, cuts, review, sources };
};

describe("director-made video ads", () => {
  it("makes, reviews and saves one ad, paid and charged once however often it's retried", async () => {
    const ctx = await setup();
    const { actor, balance, db, fal, productId } = ctx;
    const held = await holdAdCredits(actor, productId, null);
    expect(await holdAdCredits(actor, productId, null)).toEqual(held);
    expect(await balance()).toBe(40);
    const first = await makeCut(ctx, 0);
    const paid = fal.submits().length;
    // A retry of every stage reads the same fal requests back.
    const again = await makeCut(ctx, 0);
    expect(fal.submits()).toHaveLength(paid);
    expect(again.cuts).toEqual(first.cuts);
    // Cast, film, the 4:5 crop, two captions and three frames.
    expect(paid).toBe(8);
    expect(first.review.passed).toBe(true);
    // The Qloo buyers set the cast; the Director the look.
    expect(first.concept.cast).toMatchObject({
      age: "30 to 34",
      gender: "woman",
    });
    const cast = fal
      .submits()
      .find((one) => one.args.endpoint_id === MODELS.cast);
    expect(cast?.args.input).toMatchObject({ image_urls: [MOCKUP, ART] });
    const film = fal
      .submits()
      .find((one) => one.args.endpoint_id === MODELS.film);
    expect(film?.args.input).toMatchObject({
      aspect_ratio: "9:16",
      audio: true,
    });
    await saveAdVideos(actor, productId, first.cuts);
    await settleAdCredits(actor, held ?? { available: 0, id: "" }, null);
    await releaseHeldAd(actor, productId);
    expect(await balance()).toBe(40);
    const row = await db.query.product.findFirst({ where: { id: productId } });
    expect(row?.videos).toEqual([
      { aiModel: true, aspect: "9:16", url: first.cuts.tall },
      { aiModel: true, aspect: "4:5", url: first.cuts.feed },
    ]);
  });

  it("sends the Reviewer's fixes to the Director once and makes the ad again", async () => {
    const ctx = await setup({ reviews: [FAIL, PASS] });
    const first = await makeCut(ctx, 0);
    expect(first.review.passed).toBe(false);
    const redo = await makeCut(ctx, 1, {
      fixes: first.review.fixes,
      previous: first.concept as never,
    });
    expect(redo.review.passed).toBe(true);
    const directed = ctx.agents.asked.filter(
      (one) => one.name === "ad_director"
    );
    expect(directed).toHaveLength(2);
    expect(directed[1]?.prompt).toContain(FAIL.fixes[0]);
    const reviewed = ctx.agents.asked.find(
      (one) => one.name === "ad_video_review"
    );
    // The art, the cast still and three frames of the finished cut.
    expect(reviewed?.images).toHaveLength(5);
    expect(reviewed?.images[0]).toBe(ART);
    expect(ctx.fal.submits()).toHaveLength(16);
  });

  it("gives the credits back when the ad fails", async () => {
    const { actor, balance, productId } = await setup();
    await holdAdCredits(actor, productId, null);
    expect(await balance()).toBe(40);
    await releaseHeldAd(actor, productId);
    await releaseHeldAd(actor, productId);
    expect(await balance()).toBe(100);
  });

  it("makes no ad for a merchant who can't afford it", async () => {
    const { actor, balance, productId } = await setup({ credits: 30 });
    expect(await holdAdCredits(actor, productId, null)).toBeUndefined();
    await releaseHeldAd(actor, productId);
    expect(await balance()).toBe(30);
  });
});
