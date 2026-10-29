import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { buyersPanel, discoverBrands } from "@wovain/core/brand-discovery";
import type {
  Blank,
  DiscoveryAnswers,
  DiscoveryRequest,
  Love,
} from "@wovain/core/brand-discovery";
import { searchCatalog } from "@wovain/core/fourthwall";
import { blankVariants } from "@wovain/core/fourthwall-drops";
import { knownGarments } from "@wovain/core/garment-colors";
import { withLlmTrace } from "@wovain/core/nemotron";
import { DecisionTrace } from "@wovain/core/trace";
import { user } from "@wovain/db/schema/auth";
import { decisionTrace } from "@wovain/db/schema/autonomy";
import { and, count, eq, gt } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { listConnections, withProvider } from "./connections";
import { flagContextOf } from "./flags";
import { requireOnboarding, resolveBrandReferences } from "./onboarding";

// Guided brand discovery in the onboarding brand step (openspec
// brand-discovery), behind the brand-discovery flag: Suggest for me, the
// questionnaire, the merchant's own references and the "Your buyers"
// panel. Every run is saved as a decision trace (agent brand_discovery).
//
// Credits: free in onboarding. A newcomer's free credits go to their first
// drop, so discovery spends none; wovain pays for it, and each merchant
// starts at most DISCOVERIES_PER_HOUR an hour.

const MINUTE_MS = 60_000;
const DISCOVERIES_PER_HOUR = 12;
const BLANK_TTL_MS = 24 * 60 * MINUTE_MS;
const BLANK_TIMEOUT_MS = 8000;

export const discoveryOn = async (actor: Actor) =>
  await actor.core.flags.isOn("brand-discovery", flagContextOf(actor));

const requireDiscovery = async (actor: Actor) => {
  await requireOnboarding(actor);
  if (!(await discoveryOn(actor))) {
    throw createError({
      fix: "Turn on the brand-discovery flag for this environment.",
      message: "Brand suggestions aren't available yet",
      status: 404,
      why: "The brand-discovery flag is off.",
    });
  }
};

const discoveriesExhausted = () =>
  createError({
    code: "DISCOVERY_LIMIT",
    fix: "Wait an hour, or pick one of the suggestions you already have.",
    message: "You've asked for a lot of suggestions this hour",
    status: 429,
    why: `Each merchant asks for at most ${DISCOVERIES_PER_HOUR} sets of suggestions an hour.`,
  });

const discoveriesUsed = async (actor: Actor) => {
  const [used] = await actor.db
    .select({ runs: count() })
    .from(decisionTrace)
    .where(
      and(
        eq(decisionTrace.userId, actor.userId),
        eq(decisionTrace.agent, "brand_discovery"),
        eq(decisionTrace.step, "discovery.start"),
        gt(decisionTrace.at, new Date(Date.now() - 60 * MINUTE_MS))
      )
    );
  return used?.runs ?? 0;
};

// Fourthwall's catalog is the same for every shop: the most popular
// renderable tee and its colours are read once a day per server.
let cachedBlank: { at: number; blank: Blank } | undefined;

// What the palettes are held to when the shop can't be read: the colours
// every Fourthwall tee comes in, said to be a stand-in.
const ASSUMED: Blank = {
  assumed: true,
  colors: knownGarments(["Black", "White", "Natural", "Heather Grey"]),
  name: "a classic tee",
};

const readBlank = async (actor: Actor): Promise<Blank> => {
  if (cachedBlank !== undefined && Date.now() - cachedBlank.at < BLANK_TTL_MS) {
    return cachedBlank.blank;
  }
  const connections = await listConnections(actor);
  const fourthwall = connections.find((row) => row.provider === "fourthwall");
  if (fourthwall === undefined || fourthwall.needsReconnect) {
    return ASSUMED;
  }
  try {
    const blank = await withProvider(actor, "fourthwall", async (call) => {
      const [tee] = await searchCatalog(call);
      if (tee === undefined) {
        throw new Error("Fourthwall listed no renderable t-shirt");
      }
      const { colors } = await blankVariants(call, tee.slug);
      return { assumed: false, colors: knownGarments(colors), name: tee.name };
    });
    if (blank.colors.length === 0) {
      throw new Error(`No colour of ${blank.name} has a known hex`);
    }
    cachedBlank = { at: Date.now(), blank };
    return blank;
  } catch (error) {
    // The palettes still fit the stand-in colours; the failure is logged.
    evlog.error({
      discovery: { step: "fourthwall.blank" },
      error: {
        code: "DISCOVERY_BLANK_FAILED",
        message: error instanceof Error ? error.message : String(error),
        name: "DiscoveryBlankFailed",
      },
    });
    return ASSUMED;
  }
};

const withTimeout = async <T>(work: Promise<T>, fallback: T, ms: number) =>
  await Promise.race([work, delay(ms, fallback)]);

const localeOf = async (actor: Actor) => {
  const [row] = await actor.db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, actor.userId));
  return row?.locale ?? "en";
};

// Runs one traced discovery step and saves the trace; a trace that won't
// save is logged, the answer stands.
const traced = async <T>(
  actor: Actor,
  run: (trace: DecisionTrace) => Promise<T>
): Promise<T> => {
  const trace = new DecisionTrace(
    { userId: actor.userId },
    traceSinkFor(actor)
  );
  const routed = await actor.core.flags.isOn(
    "model-routing",
    flagContextOf(actor)
  );
  try {
    return await withLlmTrace(
      {
        decisions: trace,
        distinctId: actor.userId,
        routed,
        traceId: randomUUID().replaceAll("-", ""),
      },
      async () => await run(trace)
    );
  } finally {
    await trace.flush().catch((error: unknown) => {
      evlog.error({
        decisionTrace: {
          reason: error instanceof Error ? error.message : String(error),
          userId: actor.userId,
        },
        error: "DECISION_TRACE_NOT_SAVED",
      });
    });
  }
};

// The merchant's references as Qloo entities, through the shared cache.
const entitiesOf = async (actor: Actor, references: string[]) => {
  const resolved = await resolveBrandReferences(actor, references);
  const seen = new Set<string>();
  return resolved
    .flatMap((one) => one.entities)
    .filter((entity) => {
      const fresh = !seen.has(entity.id);
      seen.add(entity.id);
      return fresh;
    })
    .map((entity): Love => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
    }));
};

export type DiscoverInput =
  | { mode: "auto"; round: number }
  | { answers: DiscoveryAnswers; mode: "questions" }
  | { mode: "references"; references: string[] };

export const discover = async (actor: Actor, input: DiscoverInput) => {
  await requireDiscovery(actor);
  if ((await discoveriesUsed(actor)) >= DISCOVERIES_PER_HOUR) {
    throw discoveriesExhausted();
  }
  const request: DiscoveryRequest =
    input.mode === "references"
      ? {
          entities: await entitiesOf(actor, input.references),
          mode: "references",
        }
      : input;
  const answers = input.mode === "questions" ? input.answers : undefined;
  const locale = await localeOf(actor);
  return await traced(
    actor,
    async (trace) =>
      await discoverBrands(
        {
          ask: actor.core.nemotron,
          blank: withTimeout(readBlank(actor), ASSUMED, BLANK_TIMEOUT_MS),
          locale,
          log: actor.log,
          qloo: actor.core.qloo,
          salt: actor.userId,
          tavily: actor.core.tavily,
          trace,
        },
        request,
        {
          feeling: answers?.feeling,
          goal: answers?.goal,
          involvement: answers?.involvement,
        }
      )
  );
};

// "Your buyers" for the merchant's references.
export const buyers = async (actor: Actor, references: string[]) => {
  await requireDiscovery(actor);
  const entities = await entitiesOf(actor, references);
  if (entities.length === 0) {
    return null;
  }
  return await traced(
    actor,
    async (trace) =>
      await buyersPanel(
        { log: actor.log, qloo: actor.core.qloo, trace },
        entities
      )
  );
};

// Autocomplete for "things you love": Qloo entities named like the text.
export const searchTaste = async (actor: Actor, query: string) => {
  await requireOnboarding(actor);
  const found = await actor.core.qloo.search(query, {
    log: actor.log,
    take: 6,
  });
  return found.map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
  }));
};
