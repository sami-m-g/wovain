import type { ProviderId } from "@wovain/core/upstream";
import {
  autonomySetting,
  brandProfile,
  tasteReference,
} from "@wovain/db/schema/autonomy";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

import {
  distinctReferences,
  referenceKey,
  resolveReferences,
  writeBrandMemory,
} from "../memory/brand-identity";
import type { BrandEntity, ResolvedReference } from "../memory/brand-identity";
import type { Actor } from "./actor";
import { autonomyOf } from "./approvals";
import { listConnections, platformFal } from "./connections";
import { flagContextOf } from "./flags";

// The first-run wizard (openspec onboarding-wizard): connection health, the
// brand identity from the designer's taste references, and whether the
// autonomy step was saved. Behind the onboarding-wizard flag.

export type ConnectionState = "connected" | "expired" | "missing";

export interface ProviderHealth {
  // What wovain does with it: publish products, stage ads or draw art.
  neededFor: "ads" | "art" | "publish";
  provider: ProviderId;
  // A drop can't start without it.
  required: boolean;
  state: ConnectionState;
}

export interface BrandInput {
  displayName?: string | undefined;
  niches: string[];
  palette: string[];
  tasteReferences: string[];
  voice?: string | undefined;
}

export const onboardingOff = () =>
  createError({
    fix: "Turn on the onboarding-wizard flag for this environment.",
    message: "The onboarding wizard isn't available yet",
    status: 404,
    why: "The onboarding-wizard flag is off.",
  });

const wizardOn = async (actor: Actor) =>
  await actor.core.flags.isOn("onboarding-wizard", flagContextOf(actor));

export const requireOnboarding = async (actor: Actor) => {
  if (!(await wizardOn(actor))) {
    throw onboardingOff();
  }
};

// Each provider a drop uses, in the order a run needs it. fal is left out
// while wovain draws on its own key.
export const connectionHealth = async (
  actor: Actor,
  wovainDraws: boolean
): Promise<ProviderHealth[]> => {
  const rows = await listConnections(actor);
  const stateOf = (provider: ProviderId): ConnectionState => {
    const row = rows.find((each) => each.provider === provider);
    if (row === undefined) {
      return "missing";
    }
    return row.needsReconnect ? "expired" : "connected";
  };
  const providers: Omit<ProviderHealth, "state">[] = [
    ...(wovainDraws
      ? []
      : [
          {
            neededFor: "art" as const,
            provider: "fal" as const,
            required: true,
          },
        ]),
    { neededFor: "publish", provider: "fourthwall", required: true },
    { neededFor: "ads", provider: "meta", required: false },
  ];
  return providers.map((each) => ({ ...each, state: stateOf(each.provider) }));
};

export const onboardingStatus = async (actor: Actor) => {
  if (!(await wizardOn(actor))) {
    return { enabled: false as const };
  }
  const wovainDraws = await platformFal(actor);
  const [connections, [brand], [autonomyRow], autonomyOn, discovery] =
    await Promise.all([
      connectionHealth(actor, wovainDraws),
      actor.db
        .select()
        .from(brandProfile)
        .where(eq(brandProfile.userId, actor.userId)),
      actor.db
        .select({ id: autonomySetting.id })
        .from(autonomySetting)
        .where(eq(autonomySetting.userId, actor.userId)),
      actor.core.flags.isOn("autonomy-approvals", flagContextOf(actor)),
      actor.core.flags.isOn("brand-discovery", flagContextOf(actor)),
    ]);
  const ready = (provider: ProviderId) =>
    connections.find((each) => each.provider === provider)?.state ===
    "connected";
  return {
    autonomy: autonomyOn ? await autonomyOf(actor) : null,
    brand:
      brand === undefined
        ? null
        : {
            displayName: brand.displayName,
            niches: brand.niches,
            palette: brand.palette,
            qlooEntities: brand.qlooEntities,
            tasteReferences: brand.tasteReferences,
            voice: brand.voice,
          },
    canStartDrop: connections.every(
      (each) => !each.required || each.state === "connected"
    ),
    connections,
    // Guided brand discovery (the brand-discovery flag).
    discovery,
    enabled: true as const,
    // The merchant reached the wizard's last step.
    finished: (brand?.onboardedAt ?? null) !== null,
    steps: {
      autonomy: autonomyRow !== undefined,
      brand: brand !== undefined && brand.tasteReferences.length > 0,
      connect: ready("fourthwall") && ready("meta"),
    },
    wovainDraws,
  };
};

// The merchant reached the wizard's last step: the overview stops sending
// them to the wizard. The first time counts.
export const finishOnboarding = async (actor: Actor) => {
  await requireOnboarding(actor);
  await actor.db
    .insert(brandProfile)
    .values({ onboardedAt: new Date(), userId: actor.userId })
    .onConflictDoUpdate({
      set: {
        onboardedAt: sql`coalesce(${brandProfile.onboardedAt}, excluded.onboarded_at)`,
      },
      target: brandProfile.userId,
    });
  return { finished: true as const };
};

const MINUTE_MS = 60_000;
// A resolved reference is reused for 30 days; one a provider failed on is
// looked up again after 10 minutes.
const FRESH_MS = 30 * 24 * 60 * MINUTE_MS;
const RETRY_FAILED_MS = 10 * MINUTE_MS;
// Each lookup that misses the cache costs up to one Qloo search, one Tavily
// search, one Nemotron call and five more Qloo searches on wovain's keys, so
// each merchant starts at most 20 an hour (four full sets of references).
const LOOKUP_WINDOW_MS = 60 * MINUTE_MS;
const LOOKUPS_PER_HOUR = 20;

const lookupsExhausted = () =>
  createError({
    code: "ONBOARDING_LOOKUPS_EXHAUSTED",
    fix: "Wait an hour, or keep the references you already looked up.",
    message: "You've looked up a lot of references this hour",
    status: 429,
    why: `Each merchant looks up at most ${LOOKUPS_PER_HOUR} new taste references an hour.`,
  });

type CachedRow = typeof tasteReference.$inferSelect;

const isFresh = (row: CachedRow, now: number) =>
  now - row.resolvedAt.getTime() < (row.failed ? RETRY_FAILED_MS : FRESH_MS);

// The cached answer in this merchant's spelling of the reference.
const asResolved = (reference: string, row: CachedRow): ResolvedReference => ({
  entities: row.entities.map((entity) =>
    entity.from === undefined ? entity : { ...entity, from: reference }
  ),
  failed: row.failed,
  reference,
  sources: row.sources,
  status: row.status,
});

// Merchant-started lookups that reached the providers in the last hour.
const lookupsUsed = async (actor: Actor, now: number) => {
  const [used] = await actor.db
    .select({ lookups: count() })
    .from(tasteReference)
    .where(
      and(
        eq(tasteReference.resolvedBy, actor.userId),
        gt(tasteReference.resolvedAt, new Date(now - LOOKUP_WINDOW_MS))
      )
    );
  return used?.lookups ?? 0;
};

// Looks the references up with Qloo, Tavily and Nemotron and keeps the
// answers in the cache.
const lookUpAndKeep = async (
  actor: Actor,
  references: readonly string[],
  now: number
) => {
  if ((await lookupsUsed(actor, now)) + references.length > LOOKUPS_PER_HOUR) {
    throw lookupsExhausted();
  }
  const { core, log } = actor;
  const resolved = await resolveReferences(
    { ask: core.nemotron, log, search: core.qloo.search, web: core.tavily },
    references
  );
  if (resolved.length > 0) {
    await actor.db
      .insert(tasteReference)
      .values(
        resolved.map((one) => ({
          entities: one.entities,
          failed: one.failed,
          key: referenceKey(one.reference),
          reference: one.reference,
          resolvedAt: new Date(now),
          resolvedBy: actor.userId,
          sources: one.sources,
          status: one.status,
        }))
      )
      .onConflictDoUpdate({
        set: {
          entities: sql`excluded.entities`,
          failed: sql`excluded.failed`,
          reference: sql`excluded.reference`,
          resolvedAt: sql`excluded.resolved_at`,
          resolvedBy: sql`excluded.resolved_by`,
          sources: sql`excluded.sources`,
          status: sql`excluded.status`,
        },
        target: tasteReference.key,
      });
  }
  return resolved;
};

// Resolves the references through the shared cache: only the ones it
// doesn't hold, or holds stale, reach the providers, within the merchant's
// hourly limit. One answer per distinct reference, in the order given.
const resolveCached = async (
  actor: Actor,
  references: readonly string[]
): Promise<ResolvedReference[]> => {
  const distinct = distinctReferences(references);
  if (distinct.length === 0) {
    return [];
  }
  const now = Date.now();
  const rows = await actor.db
    .select()
    .from(tasteReference)
    .where(inArray(tasteReference.key, distinct.map(referenceKey)));
  const cached = new Map(
    rows.filter((row) => isFresh(row, now)).map((row) => [row.key, row])
  );
  const missing = distinct.filter(
    (reference) => !cached.has(referenceKey(reference))
  );
  const looked =
    missing.length === 0 ? [] : await lookUpAndKeep(actor, missing, now);
  const fetched = new Map(
    looked.map((one) => [referenceKey(one.reference), one])
  );
  return distinct.flatMap((reference) => {
    const key = referenceKey(reference);
    const row = cached.get(key);
    if (row !== undefined) {
      return [asResolved(reference, row)];
    }
    const one = fetched.get(key);
    return one === undefined ? [] : [one];
  });
};

export const resolveBrandReferences = async (
  actor: Actor,
  references: string[]
) => {
  await requireOnboarding(actor);
  return await resolveCached(actor, references);
};

// The brand's Qloo entities, each once, from what its references resolved
// to. They only ever come from Qloo, never from the client.
const entitiesOf = (resolved: readonly ResolvedReference[]): BrandEntity[] => {
  const seen = new Set<string>();
  return resolved.flatMap(({ entities }) =>
    entities.filter((entity) => {
      const fresh = !seen.has(entity.id);
      seen.add(entity.id);
      return fresh;
    })
  );
};

// The references are resolved here, on the server, so the saved entities
// always match the saved references; the ones already looked up come from
// the cache.
export const saveBrand = async (actor: Actor, input: BrandInput) => {
  await requireOnboarding(actor);
  const references = await resolveCached(actor, input.tasteReferences);
  const values = {
    displayName: input.displayName ?? null,
    niches: input.niches,
    palette: input.palette,
    qlooEntities: entitiesOf(references),
    tasteReferences: input.tasteReferences,
    voice: input.voice ?? null,
  };
  await actor.db
    .insert(brandProfile)
    .values({ ...values, userId: actor.userId })
    .onConflictDoUpdate({ set: values, target: brandProfile.userId });
  // The brief writer and the ad copywriter read the brand from memory. The
  // profile is saved either way; a memory failure is logged, and the
  // answer says so.
  const { memory } = actor.core;
  let remembered = false;
  if (memory !== undefined) {
    try {
      await writeBrandMemory(memory, actor.userId, input);
      remembered = true;
    } catch (error) {
      evlog.error({
        error: "ONBOARDING_MEMORY_FAILED",
        reason: error instanceof Error ? error.message : String(error),
        userId: actor.userId,
      });
    }
  }
  return { references, remembered, saved: true as const };
};
