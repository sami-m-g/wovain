import { createHash } from "node:crypto";

import { EventPublisher } from "@orpc/server";
import { conversationId } from "@wovain/core/ads";
import { adDemandOf } from "@wovain/core/demand";
import type { AdDemand } from "@wovain/core/demand";
import { suggestDirections } from "@wovain/core/drop-directions";
import type {
  DirectionEvent,
  Directions,
  DirectionsAnswer,
  DirectionStep,
  DropDirection,
} from "@wovain/core/drop-directions";
import { EVENTS } from "@wovain/core/events";
import type { ToolCall } from "@wovain/core/upstream";
import { brandProfile, decisionTrace } from "@wovain/db/schema/autonomy";
import { directionCache } from "@wovain/db/schema/seller";
import { and, count, eq, gt } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

import type { Actor } from "./actor";
import { localeOf, traced } from "./brand-discovery";
import { listConnections, withProvider } from "./connections";
import { flagContextOf } from "./flags";
import { assertQlooOn } from "./ideas";
import { outcomeModelFor, outcomesOn } from "./outcomes";

// What to sell next, in the new-drop step (openspec drop-directions),
// behind the drop-directions flag: 3 to 5 directions from Qloo trends with
// Tavily momentum and saturation. Within the saved brand when there is one
// (unless the merchant ignores it this time), else across Qloo audiences;
// a brand is never required. Every request is saved as a decision trace
// (agent drop_directions). Free, like brand discovery; each merchant asks
// at most DIRECTIONS_PER_HOUR times an hour.
//
// Fast: the answer is kept per merchant and request (direction_cache) and
// served at once; a kept answer older than FRESH_MS is served too, while
// Inngest finds a new one in the background (stale-while-revalidate). A
// fresh search streams: each card is sent the moment it is written.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DIRECTIONS_PER_HOUR = 20;
// A kept answer is fresh for 6 hours, and served (while refreshing) for a
// week: trends move over days, not minutes.
export const FRESH_MS = 6 * HOUR_MS;
export const KEEP_MS = 7 * 24 * HOUR_MS;

export const directionsOn = async (actor: Actor) =>
  await actor.core.flags.isOn("drop-directions", flagContextOf(actor));

// idea-evidence-gate: only directions with Qloo evidence, proof of demand
// and a competition read, ranked by the sweet spot's lower bound.
const gateOn = async (actor: Actor) =>
  await actor.core.flags.isOn("idea-evidence-gate", flagContextOf(actor));

const directionsOff = () =>
  createError({
    fix: "Turn on the drop-directions flag for this environment.",
    message: "Suggested directions aren't available yet",
    status: 404,
    why: "The drop-directions flag is off.",
  });

const directionsExhausted = () =>
  createError({
    code: "DIRECTIONS_LIMIT",
    fix: "Wait an hour, or write your own direction.",
    message: "You've asked for a lot of directions this hour",
    status: 429,
    why: `Each merchant asks for at most ${DIRECTIONS_PER_HOUR} sets of directions an hour.`,
  });

const directionsUsed = async (actor: Actor) => {
  const [used] = await actor.db
    .select({ runs: count() })
    .from(decisionTrace)
    .where(
      and(
        eq(decisionTrace.userId, actor.userId),
        eq(decisionTrace.agent, "drop_directions"),
        eq(decisionTrace.step, "directions.qloo"),
        gt(decisionTrace.at, new Date(Date.now() - HOUR_MS))
      )
    );
  return used?.runs ?? 0;
};

export interface DirectionsInput {
  // "Ignore my brand this time": suggest across audiences.
  ignoreBrand: boolean;
  // "Show me others" (open mode).
  round: number;
}

// What the step is sent while it waits: the step under way, each card as it
// is written, then the whole answer (kept or new).
export type DirectionsChunk =
  | { kind: "step"; step: DirectionStep }
  | { direction: DropDirection; kind: "direction" }
  // A card shown with its facts whose words then failed the check.
  | { key: string; kind: "withdrawn" }
  | {
      answer: DirectionsAnswer;
      // Served from what was kept; `stale` when a refresh was started.
      cached: boolean;
      kind: "done";
      stale: boolean;
    };

const loadBrand = async (actor: Actor) => {
  const [brand] = await actor.db
    .select({
      demographics: brandProfile.demographics,
      niches: brandProfile.niches,
      qlooEntities: brandProfile.qlooEntities,
      voice: brandProfile.voice,
    })
    .from(brandProfile)
    .where(eq(brandProfile.userId, actor.userId));
  return brand !== undefined && brand.qlooEntities.length > 0
    ? brand
    : undefined;
};

type SavedBrand = NonNullable<Awaited<ReturnType<typeof loadBrand>>>;

// One kept answer per request and brand state: a changed brand, locale or
// round is a new key.
export const cacheKeyOf = (
  input: DirectionsInput,
  brand: SavedBrand | undefined,
  locale: string,
  // Answers made through the evidence gate are kept apart.
  gated = false
) => {
  const scoped = brand !== undefined && !input.ignoreBrand;
  const state = scoped
    ? createHash("sha256")
        .update(
          JSON.stringify([
            brand.qlooEntities.map((entity) => entity.id).toSorted(),
            brand.niches,
            brand.demographics,
            brand.voice,
          ])
        )
        .digest("hex")
        .slice(0, 16)
    : "none";
  const base = `${scoped ? "brand" : "open"}:${input.round}:${locale}:${state}`;
  return gated ? `${base}:gated` : base;
};

const readCache = async (actor: Actor, key: string) => {
  const [row] = await actor.db
    .select({ at: directionCache.updatedAt, payload: directionCache.payload })
    .from(directionCache)
    .where(
      and(eq(directionCache.userId, actor.userId), eq(directionCache.key, key))
    );
  return row;
};

const writeCache = async (
  actor: Actor,
  key: string,
  payload: DirectionsAnswer
) => {
  await actor.db
    .insert(directionCache)
    .values({ key, payload, userId: actor.userId })
    .onConflictDoUpdate({
      set: { payload, updatedAt: new Date() },
      target: [directionCache.userId, directionCache.key],
    });
};

// Asks Inngest to find the directions again; a refresh that can't be
// queued is logged, and the kept answer still stands.
const requestRefresh = async (actor: Actor, input: DirectionsInput) => {
  try {
    await actor.events?.send({
      data: { ...input, userId: actor.userId },
      name: EVENTS.directionsRefresh,
    });
  } catch (error) {
    evlog.error({
      directions: { userId: actor.userId },
      error: {
        code: "DIRECTIONS_REFRESH_NOT_QUEUED",
        message: error instanceof Error ? error.message : String(error),
        name: "DirectionsRefreshNotQueued",
      },
    });
  }
};

// Finds the directions now, reports progress, keeps the answer.
// Whether the merchant's Meta account can be read for the Ad Library.
const metaReady = async (actor: Actor) => {
  const rows = await listConnections(actor);
  return rows.some((row) => row.provider === "meta" && !row.needsReconnect);
};

// The merchant's track record, when feedback-loop is on.
const trackRecordOf = async (actor: Actor) =>
  (await outcomesOn(actor)) ? await outcomeModelFor(actor) : undefined;

// Finds the directions now, reports progress, keeps the answer. With Meta
// connected, the Ad Library adds its proof through the merchant's Meta
// session; a session that can't open is logged and the marketplaces alone
// prove demand.
const search = async (
  actor: Actor,
  input: DirectionsInput,
  onEvent?: (event: DirectionEvent) => void
): Promise<DirectionsAnswer> => {
  const [brand, locale, meta, gate, outcomes] = await Promise.all([
    loadBrand(actor),
    localeOf(actor),
    metaReady(actor),
    gateOn(actor),
    // feedback-loop on: the merchant's track record scales each rank.
    trackRecordOf(actor),
  ]);
  const scoped = brand !== undefined && !input.ignoreBrand;
  const run = async (adLibrary?: (theme: string) => Promise<AdDemand>) =>
    await traced(
      actor,
      async (trace) =>
        await suggestDirections(
          {
            adLibrary,
            ask: actor.core.nemotron,
            gate,
            locale,
            log: actor.log,
            onEvent,
            outcomes,
            qloo: actor.core.qloo,
            tavily: actor.core.tavily,
            trace,
          },
          {
            brand: scoped
              ? {
                  ageAffinity: brand.demographics.ageAffinity,
                  entities: brand.qlooEntities,
                  genders: brand.demographics.genders,
                  niches: brand.niches,
                  voice: brand.voice,
                }
              : undefined,
            round: input.round,
            salt: actor.userId,
          }
        )
    );
  let directions: Directions;
  if (meta) {
    let started = false;
    try {
      directions = await withProvider(actor, "meta", async (call) => {
        started = true;
        const conversation = conversationId(`directions:${actor.userId}`);
        const tagged: ToolCall = async (tool, args) =>
          await call(tool, { ...args, client_conversation_id: conversation });
        return await run(async (theme) => await adDemandOf(tagged, theme));
      });
    } catch (error) {
      if (started) {
        throw error;
      }
      evlog.error({
        directions: { userId: actor.userId },
        error: {
          code: "DIRECTIONS_AD_LIBRARY_UNAVAILABLE",
          message: error instanceof Error ? error.message : String(error),
          name: "DirectionsAdLibraryUnavailable",
        },
      });
      directions = await run();
    }
  } else {
    directions = await run();
  }
  const answer = { ...directions, hasBrand: brand !== undefined };
  await writeCache(actor, cacheKeyOf(input, brand, locale, gate), answer);
  return answer;
};

// The background refresh (Inngest): no hourly limit, it replaces what the
// merchant already sees.
export const refreshDirections = async (
  actor: Actor,
  input: DirectionsInput
) => {
  if (!(await directionsOn(actor))) {
    return;
  }
  await assertQlooOn(actor);
  await search(actor, input);
};

// What the search reports, then how it ended.
interface Progress {
  progress:
    | DirectionEvent
    | { answer: DirectionsAnswer; kind: "end" }
    | { error: unknown; kind: "failed" };
}

// The new-drop step's directions: what was kept, at once, or a new search
// streamed card by card (oRPC's event iterator).
export const streamDirections = async function* streamDirections(
  actor: Actor,
  input: DirectionsInput
): AsyncGenerator<DirectionsChunk> {
  if (!(await directionsOn(actor))) {
    throw directionsOff();
  }
  await assertQlooOn(actor);
  const [brand, locale, gate] = await Promise.all([
    loadBrand(actor),
    localeOf(actor),
    gateOn(actor),
  ]);
  const kept = await readCache(actor, cacheKeyOf(input, brand, locale, gate));
  const age =
    kept === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() - kept.at.getTime();
  if (kept !== undefined && age < KEEP_MS) {
    const stale = age >= FRESH_MS;
    if (stale) {
      await requestRefresh(actor, input);
    }
    yield { answer: kept.payload, cached: true, kind: "done", stale };
    return;
  }
  if ((await directionsUsed(actor)) >= DIRECTIONS_PER_HOUR) {
    throw directionsExhausted();
  }
  const publisher = new EventPublisher<Progress>({
    maxBufferedEvents: Number.POSITIVE_INFINITY,
  });
  const progress = publisher.subscribe("progress");
  const run = async () => {
    try {
      const answer = await search(actor, input, (event) =>
        publisher.publish("progress", event)
      );
      publisher.publish("progress", { answer, kind: "end" });
    } catch (error) {
      publisher.publish("progress", { error, kind: "failed" });
    }
  };
  const running = run();
  for await (const event of progress) {
    if (event.kind === "failed") {
      throw event.error;
    }
    if (event.kind === "end") {
      yield { answer: event.answer, cached: false, kind: "done", stale: false };
      break;
    }
    yield event;
  }
  await running;
};

// Opening the app warms the suggestions: a missing or stale answer for the
// default request is found in the background, so the step opens at once.
export const warmDirections = async (actor: Actor) => {
  if (!(await directionsOn(actor))) {
    return { queued: false };
  }
  const input = { ignoreBrand: false, round: 0 };
  const [brand, locale, gate] = await Promise.all([
    loadBrand(actor),
    localeOf(actor),
    gateOn(actor),
  ]);
  const kept = await readCache(actor, cacheKeyOf(input, brand, locale, gate));
  if (kept !== undefined && Date.now() - kept.at.getTime() < FRESH_MS) {
    return { queued: false };
  }
  await requestRefresh(actor, input);
  return { queued: true };
};
