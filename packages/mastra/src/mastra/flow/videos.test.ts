import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { creditBalance } from "@wovain/billing/credits";
import { applyGrant } from "@wovain/billing/mirror";
import { createBilling } from "@wovain/billing/service";
import type { WovainEvent } from "@wovain/core/events";
import { createFalJobs } from "@wovain/core/fal";
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
  productVideoUrl,
  requestProductVideos,
  saveProductVideos,
  submitProductVideo,
} from "./videos";

// Video ad clips on real Postgres (PGlite, with the app's migrations) and a
// fake fal: a retried submit is charged once, and video ads stay off where
// the environment sets no model. Nothing reaches fal.

const MIGRATIONS = fileURLToPath(
  new URL("../../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";
const MODEL = "fal/video";
const MOCKUP = "https://cdn.test/mockup.png";

const fakeFal = () => {
  const calls: { args: Record<string, unknown>; tool: string }[] = [];
  const call: ToolCall = async (tool, args) => {
    calls.push({ args, tool });
    const replies: Record<string, unknown> = {
      check_job: { status: "COMPLETED" },
      get_job_result: { video: { url: "https://fal.test/clip.mp4" } },
      submit_job: { request_id: `req-${calls.length}` },
    };
    return await Promise.resolve(replies[tool]);
  };
  return { call, calls };
};

const setup = async ({ videoModel = MODEL }: { videoModel?: string } = {}) => {
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
    units: 100,
    userId: USER_ID,
  });
  const [found] = await db
    .insert(idea)
    .values({
      avoidNames: [],
      rank: 1,
      research: {} as never,
      score: 80,
      seed: "cats",
      theme: "Cats",
      userId: USER_ID,
    })
    .returning();
  const [drawn] = await db
    .insert(design)
    .values({
      artworkHeight: 10,
      artworkUrl: "https://example.com/a.png",
      artworkWidth: 10,
      brief: {} as never,
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
  const sent: WovainEvent[] = [];
  const actor: Actor = {
    billing: createBilling({
      BETTER_AUTH_URL: "http://localhost:3000",
      POLAR_ENVIRONMENT: "sandbox",
    }),
    core: {
      falJobs: (call: ToolCall) => createFalJobs(call),
      falKey: fal.call,
      videoModel: videoModel === "" ? undefined : videoModel,
    } as unknown as Core,
    db: db as unknown as Database,
    events: {
      send: async (event: WovainEvent) => {
        sent.push(event);
        return await Promise.resolve();
      },
    },
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, fal, productId: made?.id ?? "", sent };
};

describe("video ad clips", () => {
  it("animates the mockup once per aspect, charged once however often it's retried", async () => {
    const { actor, db, fal, productId } = await setup();
    const first = await submitProductVideo(actor, productId, "9:16");
    const again = await submitProductVideo(actor, productId, "9:16");
    expect(again).toBe(first);
    const submits = fal.calls.filter((one) => one.tool === "submit_job");
    expect(submits).toHaveLength(1);
    expect(submits[0]?.args).toMatchObject({
      endpoint_id: MODEL,
      input: { aspect_ratio: "9:16", start_image_url: MOCKUP },
    });
    const balance = await creditBalance(db as unknown as Database, USER_ID);
    expect(balance.available).toBe(90);
    const url = await productVideoUrl(actor, first);
    await saveProductVideos(actor, productId, [{ aspect: "9:16", url }]);
    const row = await db.query.product.findFirst({ where: { id: productId } });
    expect(row?.videos).toEqual([
      { aspect: "9:16", url: "https://fal.test/clip.mp4" },
    ]);
  });

  it("asks for a live product's clips once, by event id", async () => {
    const { actor, productId, sent } = await setup();
    await requestProductVideos(actor, productId);
    expect(sent).toEqual([
      {
        data: { productId, userId: USER_ID },
        id: `product-videos:${productId}`,
        name: "wovain/product.videos.requested",
      },
    ]);
  });

  it("asks for nothing where no video model is set", async () => {
    const { actor, productId, sent } = await setup({ videoModel: "" });
    await requestProductVideos(actor, productId);
    expect(sent).toEqual([]);
  });
});
