import { pickIdea } from "@wovain/core/autopilot";
import { NEMOTRON_MODEL } from "@wovain/core/nemotron";
import { user } from "@wovain/db/schema/auth";
import { design, run } from "@wovain/db/schema/seller";
import type { RunStatus } from "@wovain/db/schema/seller";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import type { Actor, RunInput } from "./actor";
import { notFound } from "./actor";
import { compensateRun, createProductCampaign } from "./campaigns";
import { autopilotDecide, generateDesign, getDesign } from "./designs";
import { researchIdeas } from "./ideas";
import { classifyFailure, track } from "./metrics";
import { createDesignProduct, publishDesignProduct } from "./products";
import { meter } from "./spend";

// A run takes a seed through the flow: research → design → approval →
// product → publish → PAUSED campaign. The request only saves the run and
// queues it; a durable workflow (../workflows/run) calls the steps below,
// each retried on its own and each safe to run twice. Without autopilot the
// run waits at the approval gate and the merchant's call resumes it; with
// autopilot, Nemotron picks the idea and makes the call.

const ACTIVE: RunStatus[] = ["running", "awaiting_approval"];

export const markRun = async (
  actor: Actor,
  id: string,
  patch: { error?: string; status?: RunStatus; step?: string }
) => {
  await actor.db
    .update(run)
    .set(patch)
    .where(and(eq(run.id, id), eq(run.userId, actor.userId)));
};

// Research, then the idea to draw: the top one, or autopilot's pick.
export const researchStep = async (
  actor: Actor,
  runId: string,
  input: RunInput
) => {
  await markRun(actor, runId, { step: "research" });
  const ideas = await researchIdeas(actor, input.seed, runId);
  const [top] = ideas;
  if (top === undefined) {
    return { ideaId: undefined };
  }
  if (!input.autopilot) {
    return { ideaId: top.id };
  }
  await meter(actor, "llm", { runId });
  const chosen = await pickIdea(
    actor.core.nemotron,
    ideas.map((row) => ({ ...row.research, id: row.id })),
    actor.log
  );
  return { ideaId: chosen.idea.id };
};

export const designStep = async (
  actor: Actor,
  runId: string,
  ideaId: string
) => {
  await markRun(actor, runId, { step: "design" });
  const drafted = await generateDesign(actor, ideaId, {
    requestId: `run:${runId}`,
  });
  return { designId: drafted.id };
};

// Autopilot decides here. A merchant's run stops at the gate: the
// workflow suspends, and decideDesign resumes it.
export const autopilotStep = async (actor: Actor, designId: string) => {
  const decided = await autopilotDecide(
    actor,
    await getDesign(actor, designId)
  );
  return {
    approved: decided.status === "approved",
    reason: decided.decisionReason,
  };
};

export const awaitApproval = async (actor: Actor, runId: string) => {
  await markRun(actor, runId, {
    status: "awaiting_approval",
    step: "approval",
  });
};

export const productStep = async (
  actor: Actor,
  runId: string,
  designId: string
) => {
  await markRun(actor, runId, { status: "running", step: "product" });
  const created = await createDesignProduct(actor, { designId });
  await markRun(actor, runId, { step: "publish" });
  const published = await publishDesignProduct(actor, created.id);
  return { productId: published.id };
};

export const campaignStep = async (
  actor: Actor,
  runId: string,
  { input, productId }: { input: RunInput; productId: string }
) => {
  await markRun(actor, runId, { step: "campaign" });
  const staged = await createProductCampaign(actor, {
    countries: input.countries,
    dailyBudget: input.dailyBudget,
    productId,
  });
  return { campaignId: staged.id };
};

// Emails the merchant when the run stops for them: a design to approve, the
// finished run, or a failure. A failed email never fails the run.
export const notifyRun = async (actor: Actor, runId: string) => {
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

const STEPS = [
  "research",
  "design",
  "approval",
  "product",
  "publish",
  "campaign",
];

// run_completed or run_failed: the success rate and run time KPIs.
const reportEnd = async (
  actor: Actor,
  runId: string,
  {
    cause,
    createdAt,
    status,
    step,
  }: {
    cause: unknown;
    createdAt: Date;
    status: "completed" | "failed";
    step: string | null;
  }
) => {
  const common = {
    duration_ms: Date.now() - createdAt.getTime(),
    run_id: runId,
  };
  if (status === "failed") {
    const { errorType, provider } = classifyFailure(cause);
    await track(actor, "run_failed", {
      ...common,
      error_type: errorType,
      failed_step: step,
      provider: provider ?? null,
    });
    return;
  }
  const [drawn] = await actor.db
    .select({ n: count() })
    .from(design)
    .where(eq(design.runId, runId));
  await track(actor, "run_completed", {
    ...common,
    design_count: drawn?.n ?? 0,
    model: NEMOTRON_MODEL,
    step_count: STEPS.indexOf(step ?? "") + 1,
  });
};

// The run's last word. A run still active ends here once (a retried finish
// changes nothing); a failed one archives the Meta campaign it left half
// staged.
export const finishRun = async (
  actor: Actor,
  runId: string,
  {
    cause,
    ...outcome
  }: { cause?: unknown; error?: string; status: "completed" | "failed" }
) => {
  const [ended] = await actor.db
    .update(run)
    .set(outcome)
    .where(and(eq(run.id, runId), inArray(run.status, ACTIVE)))
    .returning({ createdAt: run.createdAt, step: run.step });
  if (ended === undefined) {
    return;
  }
  await reportEnd(actor, runId, {
    cause: cause ?? outcome.error,
    ...ended,
    status: outcome.status,
  });
  if (outcome.status === "failed") {
    try {
      await compensateRun(actor, runId);
    } catch (error) {
      actor.log?.set({
        compensation: {
          failed: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  await notifyRun(actor, runId);
};

export const getRun = async (actor: Actor, id: string) => {
  const found = await actor.db.query.run.findFirst({
    where: { id, userId: actor.userId },
    with: {
      designs: { with: { products: { with: { campaigns: true } } } },
      ideas: { orderBy: { rank: "asc" } },
    },
  });
  if (found === undefined) {
    throw notFound.run({ id });
  }
  // Flattened: each step's rows in a list of their own.
  const { designs: drafted, ...rest } = found;
  const designs = [];
  const products = [];
  const campaigns = [];
  for (const { products: made, ...row } of drafted) {
    designs.push(row);
    for (const { campaigns: staged, ...item } of made) {
      products.push(item);
      campaigns.push(...staged);
    }
  }
  return { ...rest, campaigns, designs, products };
};

// A long-running operation: saves the run, queues it and returns it at once
// (status running, no step yet). Clients follow it with runs.get.
export const startRun = async (actor: Actor, input: RunInput) => {
  if (actor.runs === undefined) {
    throw new Error("No run engine to start the run");
  }
  // Refused before the run is saved, so a merchant over quota sees no run.
  await meter(actor, "run", { record: false });
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
    await actor.runs.start({ input, runId: created.id, userId: actor.userId });
  } catch (error) {
    await markRun(actor, created.id, {
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
    throw error;
  }
  return await getRun(actor, created.id);
};

export const listRuns = async ({ db, userId }: Actor) =>
  await db
    .select()
    .from(run)
    .where(eq(run.userId, userId))
    .orderBy(desc(run.createdAt));
