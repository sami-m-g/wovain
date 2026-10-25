import { pickIdea } from "@wovain/core/autopilot";
import { user } from "@wovain/db/schema/auth";
import { campaign, design, idea, product, run } from "@wovain/db/schema/seller";
import type { RunStatus } from "@wovain/db/schema/seller";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { Actor } from "./actor";
import { notFound } from "./actor";
import { createProductCampaign } from "./campaigns";
import { autopilotDecide, generateDesign } from "./designs";
import { researchIdeas } from "./ideas";
import { createDesignProduct, publishDesignProduct } from "./products";

// A run takes a seed through the flow. Without autopilot it stops at the
// design for the merchant's approval; with autopilot, Nemotron picks the
// idea and approves the design, and the run goes on to publish the product
// and stage a PAUSED campaign. Each step is recorded so a failed run shows
// where it stopped and why.

export interface RunInput {
  autopilot: boolean;
  countries: string[];
  dailyBudget: number;
  seed: string;
}

const update = async (
  actor: Actor,
  id: string,
  patch: { error?: string; status?: RunStatus; step?: string }
) => {
  await actor.db.update(run).set(patch).where(eq(run.id, id));
};

// Emails the merchant when the run stops for them: a design to approve, the
// finished run, or a failure. A failed email never fails the run.
const notify = async (actor: Actor, runId: string) => {
  const [row] = await actor.db
    .select({
      email: user.email,
      locale: user.locale,
      seed: run.seed,
      status: run.status,
    })
    .from(run)
    .innerJoin(user, eq(user.id, run.userId))
    .where(eq(run.id, runId));
  if (row === undefined || row.status === "running") {
    return;
  }
  try {
    await actor.mailer({
      locale: row.locale,
      message: {
        kind: "run",
        seed: row.seed,
        status: row.status,
        url: `/dashboard?run=${runId}`,
      },
      to: row.email,
    });
  } catch (error) {
    actor.log?.set({
      email: { failed: error instanceof Error ? error.message : String(error) },
    });
  }
};

const execute = async (actor: Actor, runId: string, input: RunInput) => {
  await update(actor, runId, { step: "research" });
  const ideas = await researchIdeas(actor, input.seed, runId);
  const [top] = ideas;
  if (top === undefined) {
    await update(actor, runId, {
      error: "Research found no ideas for this seed.",
      status: "failed",
    });
    return;
  }
  const chosen = input.autopilot
    ? await pickIdea(
        actor.core.nemotron,
        ideas.map((row) => ({ ...row.research, id: row.id })),
        actor.log
      )
    : { idea: top };
  await update(actor, runId, { step: "design" });
  const drafted = await generateDesign(actor, chosen.idea.id);
  if (!input.autopilot) {
    await update(actor, runId, { status: "awaiting_approval" });
    return;
  }
  const decided = await autopilotDecide(actor, drafted);
  if (decided.status !== "approved") {
    await update(actor, runId, {
      error: `Autopilot rejected the design: ${decided.decisionReason ?? ""}`,
      status: "failed",
    });
    return;
  }
  await update(actor, runId, { step: "product" });
  const created = await createDesignProduct(actor, { designId: drafted.id });
  await update(actor, runId, { step: "publish" });
  const published = await publishDesignProduct(actor, created.id);
  await update(actor, runId, { step: "campaign" });
  await createProductCampaign(actor, {
    countries: input.countries,
    dailyBudget: input.dailyBudget,
    productId: published.id,
  });
  await update(actor, runId, { status: "completed", step: "campaign" });
};

export const getRun = async (actor: Actor, id: string) => {
  const { db, userId } = actor;
  const [found] = await db
    .select()
    .from(run)
    .where(and(eq(run.id, id), eq(run.userId, userId)));
  if (found === undefined) {
    throw notFound("run", id);
  }
  const [ideas, designs] = await Promise.all([
    db.select().from(idea).where(eq(idea.runId, id)).orderBy(idea.rank),
    db.select().from(design).where(eq(design.runId, id)),
  ]);
  const products =
    designs.length === 0
      ? []
      : await db
          .select()
          .from(product)
          .where(
            inArray(
              product.designId,
              designs.map((row) => row.id)
            )
          );
  const campaigns =
    products.length === 0
      ? []
      : await db
          .select()
          .from(campaign)
          .where(
            inArray(
              campaign.productId,
              products.map((row) => row.id)
            )
          );
  return { ...found, campaigns, designs, ideas, products };
};

export const startRun = async (actor: Actor, input: RunInput) => {
  const [created] = await actor.db
    .insert(run)
    .values({
      autopilot: input.autopilot,
      seed: input.seed,
      userId: actor.userId,
    })
    .returning();
  if (created === undefined) {
    throw new Error("The run wasn't saved");
  }
  actor.log?.set({ run: { autopilot: input.autopilot, id: created.id } });
  try {
    await execute(actor, created.id, input);
  } catch (error) {
    await update(actor, created.id, {
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
    await notify(actor, created.id);
    throw error;
  }
  await notify(actor, created.id);
  return await getRun(actor, created.id);
};

export const listRuns = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(run)
    .where(eq(run.userId, userId))
    .orderBy(desc(run.createdAt));
