import { DESIGNS_PER_RUN } from "@wovain/billing/plans";
import { pickIdea } from "@wovain/core/autopilot";
import { NEMOTRON_MODEL } from "@wovain/core/nemotron";
import type { DesignFacts } from "@wovain/core/step-scorers";
import { user } from "@wovain/db/schema/auth";
import { design, run } from "@wovain/db/schema/seller";
import type { RunStatus } from "@wovain/db/schema/seller";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { log } from "evlog";

import type { Actor, RunInput } from "./actor";
import { notFound } from "./actor";
import { compensateRun, createProductCampaign } from "./campaigns";
import { requireFal } from "./connections";
import { autopilotDecide, generateDesign, getDesign } from "./designs";
import { getIdea, researchIdeas } from "./ideas";
import { classifyFailure, track } from "./metrics";
import { createDesignProduct, publishDesignProduct } from "./products";
import { assertAutopilot, assertCredits, charge } from "./spend";

// A run takes a seed through the flow: research → designs → approval →
// products → publish → PAUSED campaigns. The request only saves the run and
// queues it; a durable workflow (../workflows/run) calls the steps below,
// each retried on its own and each safe to run twice. The run draws one
// design for each of the top ideas (DESIGNS_PER_RUN), so the merchant
// compares options. Without autopilot the run waits at the approval gate
// until every design is decided, then lists each approved one; with
// autopilot, Nemotron picks the lead idea and decides each design.

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

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// One design, product or campaign failing never fails the others: each item
// runs on its own, and the step fails only when every item did (it throws
// the first error, so the step is retried or the run fails as before). A
// failed item the run goes on without is logged at error level, so it still
// reaches Error Tracking.
export const eachSettled = async <R>(
  runId: string,
  stage: string,
  items: string[],
  work: (item: string) => Promise<R>
): Promise<R[]> => {
  const settled = await Promise.allSettled(
    items.map(async (item) => await work(item))
  );
  const done: R[] = [];
  const failed: { error: unknown; item: string }[] = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") {
      done.push(outcome.value);
    } else {
      failed.push({ error: outcome.reason, item: items[index] ?? "" });
    }
  }
  const [first] = failed;
  if (done.length === 0 && first !== undefined) {
    throw first.error;
  }
  for (const { error, item } of failed) {
    log.error({
      error: "RUN_ITEM_FAILED",
      run: { id: runId, item, message: messageOf(error), stage },
    });
  }
  return done;
};

// Research, then the ideas to draw: the top ones, led by autopilot's pick.
export const researchStep = async (
  actor: Actor,
  runId: string,
  input: RunInput
) => {
  await markRun(actor, runId, { step: "research" });
  const ideas = await researchIdeas(actor, input.seed, runId);
  const ranked = ideas.map((row) => row.id);
  if (ranked.length === 0 || !input.autopilot) {
    return { ideaIds: ranked.slice(0, DESIGNS_PER_RUN) };
  }
  const chosen = await charge(
    actor,
    "assist",
    { runId },
    async () =>
      await pickIdea(
        actor.core.nemotron,
        ideas.map((row) => ({ ...row.research, id: row.id })),
        actor.log
      )
  );
  const lead = chosen.idea.id;
  return {
    ideaIds: [lead, ...ranked.filter((id) => id !== lead)].slice(
      0,
      DESIGNS_PER_RUN
    ),
  };
};

// One idea's design, keyed by the run and the idea: a retried step keeps
// the designs it drew and pays for none of them twice.
const drawDesign = async (actor: Actor, runId: string, ideaId: string) => {
  const drafted = await generateDesign(actor, ideaId, {
    requestId: `run:${runId}:${ideaId}`,
  });
  const source = await getIdea(actor, ideaId);
  const { brief } = drafted;
  // What the step's code scorer checks (@wovain/core/step-scorers).
  const facts: DesignFacts = {
    artworkWidth: drafted.artworkWidth,
    avoidNames: source.avoidNames,
    description: brief.description,
    printedText: brief.printedText,
    text: [
      brief.title,
      brief.description,
      brief.artPrompt,
      ...brief.printedText,
    ].join("\n"),
    title: brief.title,
  };
  return { designId: drafted.id, facts };
};

export const designStep = async (
  actor: Actor,
  runId: string,
  ideaIds: string[]
) => {
  await markRun(actor, runId, { step: "design" });
  const drawn = await eachSettled(
    runId,
    "design",
    ideaIds,
    async (ideaId) => await drawDesign(actor, runId, ideaId)
  );
  return {
    designIds: drawn.map((item) => item.designId),
    facts: drawn.map((item) => item.facts),
  };
};

// Autopilot decides each design here. A merchant's run stops at the gate:
// the workflow suspends, and the call on its last pending design resumes it.
export const autopilotStep = async (
  actor: Actor,
  runId: string,
  designIds: string[]
) => {
  const decided = await eachSettled(
    runId,
    "autopilot",
    designIds,
    async (designId) =>
      await autopilotDecide(actor, await getDesign(actor, designId))
  );
  return {
    approvedIds: decided
      .filter((row) => row.status === "approved")
      .map((row) => row.id),
    reasons: decided.flatMap((row) =>
      row.decisionReason === null ? [] : [row.decisionReason]
    ),
  };
};

// Why an autopilot run stopped: it approved none of its designs.
export const autopilotRejection = (reasons: string[]) =>
  `Autopilot rejected the designs: ${reasons.join("; ")}`;

// Stops the run at its gate. Answers false when the merchant already decided
// every design (they can while later ones are still drawn): the gate opens
// at once, since no call is left to resume the run.
export const awaitApproval = async (actor: Actor, runId: string) => {
  await markRun(actor, runId, {
    status: "awaiting_approval",
    step: "approval",
  });
  const pending = await actor.db
    .select({ id: design.id })
    .from(design)
    .where(
      and(
        eq(design.runId, runId),
        eq(design.userId, actor.userId),
        eq(design.status, "pending_approval")
      )
    )
    .limit(1);
  if (pending.length > 0) {
    return true;
  }
  const [reopened] = await actor.db
    .update(run)
    .set({ status: "running" })
    .where(and(eq(run.id, runId), eq(run.status, "awaiting_approval")))
    .returning({ id: run.id });
  // Not reopened: a decision just took the run on, and resumes it.
  return reopened === undefined;
};

// The run's approved designs once its gate opens: the merchant may approve
// several, including designs they drew from other ideas while it waited.
export const approvedDesigns = async (actor: Actor, runId: string) => {
  const rows = await actor.db
    .select({ id: design.id })
    .from(design)
    .where(
      and(
        eq(design.runId, runId),
        eq(design.userId, actor.userId),
        eq(design.status, "approved")
      )
    )
    .orderBy(asc(design.createdAt));
  return rows.map((row) => row.id);
};

// A product for each approved design, published.
export const productStep = async (
  actor: Actor,
  runId: string,
  designIds: string[]
) => {
  await markRun(actor, runId, { status: "running", step: "product" });
  const made = await eachSettled(
    runId,
    "product",
    designIds,
    async (designId) => {
      const created = await createDesignProduct(actor, { designId });
      return await publishDesignProduct(actor, created.id);
    }
  );
  await markRun(actor, runId, { step: "publish" });
  return {
    facts: made.map((item) => ({ price: item.price })),
    productIds: made.map((item) => item.id),
  };
};

// A paused campaign for each product.
export const campaignStep = async (
  actor: Actor,
  runId: string,
  { input, productIds }: { input: RunInput; productIds: string[] }
) => {
  await markRun(actor, runId, { step: "campaign" });
  const staged = await eachSettled(
    runId,
    "campaign",
    productIds,
    async (productId) =>
      await createProductCampaign(actor, {
        countries: input.countries,
        dailyBudget: input.dailyBudget,
        productId,
      })
  );
  return {
    campaignIds: staged.map((item) => item.id),
    facts: staged.map((item) => ({ variants: item.copy })),
  };
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
  // Refused before the run is saved, so a merchant who can't afford it, asks
  // for autopilot on Free or has no fal key to draw with sees no run.
  if (input.autopilot) {
    await assertAutopilot(actor);
  }
  await assertCredits(actor, "research");
  await requireFal(actor);
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
