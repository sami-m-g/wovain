import type { AdConcept } from "@wovain/shared/ad";
import { z } from "zod";

import type { Store } from "../store.ts";
import { generateObject, models } from "./ai.ts";
import { log, SYSTEM } from "./autopilot-decide.ts";
import type { AutopilotDeps } from "./autopilot-decide.ts";
import { AutopilotRefusedError, decisionOf, runningRun } from "./autopilot.ts";

// Autopilot's other two approval points: which researched idea to make (the
// merchant picking from research_trends) and whether a product's ad goes in
// the campaign (Add to campaign on the ad widget). Nemotron chooses; code
// screens what reaches it and checks what comes back.

const ideaChoiceSchema = z.object({
  rank: z.int().min(1).max(5),
  reason: z.string().max(400),
});

// D1: research the run's idea (Tavily), drop every theme the trademark
// screen flags or can't check, and let Nemotron pick from the rest.
export const decideIdea = async (
  { ai, model, research }: AutopilotDeps,
  store: Store,
  runId: string
) => {
  const run = await runningRun(store, runId);
  const found = await research.research({ seed: run.idea });
  const screened = await Promise.all(
    found.ideas.map(async (idea) => {
      // An idea the screen can't check counts as flagged.
      const clear = await research.screen(idea.idea).then(
        (hits) => hits.length === 0,
        () => false
      );
      return clear ? [idea] : [];
    })
  );
  const ideas = screened.flat();
  const limits = [
    `${found.ideas.length - ideas.length} idea(s) removed: trademark hits or unscreened`,
  ];
  const [top] = ideas;
  if (top === undefined) {
    return {
      decision: await log(
        store,
        runId,
        decisionOf({
          choice: "as given",
          limits,
          point: "idea",
          reason: "Research found no safe theme: design the idea as given.",
          subject: run.idea,
        })
      ),
    };
  }
  const reply = await generateObject(ai, {
    model: model ?? models.autopilot,
    prompt: JSON.stringify({
      ideas: ideas.map(({ angle, idea, rank, why }) => ({
        angle,
        idea,
        rank,
        why,
      })),
      merchantIdea: run.idea,
      task: "Pick the one idea most likely to sell this week as a tee and its matching products: real demand, a timely moment, room in the market, no brand or person's name. Give its rank and a one-line reason.",
    }),
    schema: ideaChoiceSchema,
    system: SYSTEM,
    temperature: 0.2,
  });
  const picked = ideas.find((idea) => idea.rank === reply.rank);
  const idea = picked ?? top;
  return {
    decision: await log(
      store,
      runId,
      decisionOf({
        choice: idea.idea,
        limits:
          picked === undefined
            ? [
                ...limits,
                "the model's pick wasn't a screened idea: took the top",
              ]
            : limits,
        point: "idea",
        reason: reply.reason,
        subject: run.idea,
      })
    ),
    idea,
  };
};

// Copy autopilot never publishes, whatever the model says: prices,
// discounts, scarcity and claims a product page doesn't back.
const RISKY_COPY =
  /\$\s?\d|\d+\s?%|\b(?:discount|sale|free shipping|limited time|only \d+ left|guarantee|best[- ]selling|#1)\b/iu;

const MAX_APPROVED_CONCEPTS = 3;

const conceptChoiceSchema = z.object({
  concepts: z
    .array(
      z.object({
        approve: z.boolean(),
        id: z.string().max(10),
        reason: z.string().max(200),
      })
    )
    .max(6),
});

const copyOf = (concept: AdConcept) =>
  [concept.hook, ...concept.headlines, ...concept.primaryTexts].join(" ");

// Concepts the model may approve: ready media (or carousel cards) and copy
// that passes the code check.
const eligible = (concepts: AdConcept[]) =>
  new Map(
    concepts.flatMap((concept) =>
      (concept.cards !== undefined ||
        concept.assets.some((asset) => asset.status === "ready")) &&
      !RISKY_COPY.test(copyOf(concept))
        ? [[concept.id, concept] as const]
        : []
    )
  );

// Up to three of the model's picks, one per angle.
const varied = (
  picks: z.infer<typeof conceptChoiceSchema>["concepts"],
  usable: Map<string, AdConcept>
) => {
  const approved = new Set<string>();
  const angles = new Set<string>();
  for (const pick of picks) {
    const angle = usable.get(pick.id)?.angle.trim().toLowerCase();
    if (
      pick.approve &&
      angle !== undefined &&
      !angles.has(angle) &&
      approved.size < MAX_APPROVED_CONCEPTS
    ) {
      approved.add(pick.id);
      angles.add(angle);
    }
  }
  return approved;
};

// D7: which of a design's ad concepts go in the campaign. Only for a design
// this run approved; the rest of its concepts are skipped.
export const decideAds = async (
  { ai, model }: AutopilotDeps,
  store: Store,
  runId: string,
  designId: string
) => {
  const run = await runningRun(store, runId);
  if (run.designs[designId] === undefined || run.dropped.includes(designId)) {
    throw new AutopilotRefusedError(
      `Design ${designId} wasn't approved in autopilot run ${runId}.`
    );
  }
  const ads = await store.getAds();
  const ad = ads.find((item) => item.designId === designId);
  if (ad === undefined) {
    throw new AutopilotRefusedError(`No ad concepts for ${designId} yet.`);
  }
  const usable = eligible(ad.concepts);
  const reply = await generateObject(ai, {
    model: model ?? models.autopilot,
    prompt: JSON.stringify({
      concepts: [...usable.values()].map(
        ({ angle, audience, headlines, hook, id, primaryTexts }) => ({
          angle,
          audience,
          headlines,
          hook,
          id,
          primaryTexts,
        })
      ),
      product: ad.productTitle,
      task: `Approve up to ${MAX_APPROVED_CONCEPTS} concepts for a Meta sales campaign: varied angles, a clear hook, no claim the product can't back. Skip the rest. One short reason each.`,
    }),
    schema: conceptChoiceSchema,
    system: SYSTEM,
    temperature: 0.2,
  });
  const approved = varied(reply.concepts, usable);
  await store.recordConcepts(
    designId,
    Object.fromEntries(
      ad.concepts.map((concept) => [
        concept.id,
        approved.has(concept.id) ? "approved" : "skipped",
      ])
    )
  );
  return {
    approved: [...approved],
    decision: await log(
      store,
      runId,
      decisionOf({
        choice: `${approved.size} of ${ad.concepts.length} approved`,
        limits: [
          `at most ${MAX_APPROVED_CONCEPTS}, one per angle; only concepts with ready media and copy without prices, discounts or claims`,
        ],
        point: "ads",
        reason: reply.concepts
          .map((pick) => `${pick.id}: ${pick.reason}`)
          .join(" "),
        subject: designId,
      })
    ),
  };
};
