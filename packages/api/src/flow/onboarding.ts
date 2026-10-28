import {
  resolveReferences,
  writeBrandMemory,
} from "@wovain/core/brand-identity";
import type { BrandEntity } from "@wovain/core/brand-identity";
import type { ProviderId } from "@wovain/core/upstream";
import { autonomySetting, brandProfile } from "@wovain/db/schema/autonomy";
import { eq } from "drizzle-orm";
import { createError, log as evlog } from "evlog";

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
  qlooEntities: BrandEntity[];
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
  const [connections, [brand], [autonomyRow], autonomyOn] = await Promise.all([
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
    enabled: true as const,
    steps: {
      autonomy: autonomyRow !== undefined,
      brand: brand !== undefined && brand.tasteReferences.length > 0,
      connect: ready("fourthwall") && ready("meta"),
    },
    wovainDraws,
  };
};

export const resolveBrandReferences = async (
  actor: Actor,
  references: string[]
) => {
  await requireOnboarding(actor);
  const { core, log } = actor;
  return await resolveReferences(
    {
      ask: core.nemotron,
      log,
      search: core.qloo.search,
      web: core.tavily,
    },
    references
  );
};

export const saveBrand = async (actor: Actor, input: BrandInput) => {
  await requireOnboarding(actor);
  const values = {
    displayName: input.displayName ?? null,
    niches: input.niches,
    palette: input.palette,
    qlooEntities: input.qlooEntities,
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
  return { remembered, saved: true as const };
};
