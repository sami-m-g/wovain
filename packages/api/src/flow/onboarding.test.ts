import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import type { FlagName } from "@wovain/core/flag-registry";
import type { ToolCall } from "@wovain/core/upstream";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { brandProfile } from "@wovain/db/schema/autonomy";
import { connection } from "@wovain/db/schema/seller";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, it, vi } from "vitest";

import type { Actor } from "./actor";
import { requireFal, withArtistCall } from "./connections";
import {
  onboardingStatus,
  resolveBrandReferences,
  saveBrand,
} from "./onboarding";

// The onboarding wizard on real Postgres (PGlite, with the app's
// migrations): connection health, the brand profile and the fal switch.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

const setup = async ({
  falKey,
  on = ["onboarding-wizard", "autonomy-approvals"],
}: { falKey?: ToolCall; on?: FlagName[] } = {}) => {
  const client = new PGlite();
  const db = drizzle({ client, relations });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await db.insert(user).values({
    email: "designer@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Designer",
  });
  const memory = {
    getWorkingMemory: vi.fn(async () => await Promise.resolve(null)),
    updateWorkingMemory: vi.fn(async () => await Promise.resolve()),
  };
  const actor = {
    core: {
      falKey,
      flags: {
        isOn: async (name: FlagName) =>
          await Promise.resolve(on.includes(name)),
      },
      memory,
    },
    db: db as unknown as Database,
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, memory };
};

const brand = {
  niches: ["y2k racing"],
  palette: ["#1A1A1A"],
  qlooEntities: [
    { id: "Q-WES", name: "Wes Anderson", type: "urn:entity:person" },
  ],
  tasteReferences: ["Wes Anderson", "Kenzo", "Studio Ghibli"],
  voice: "dry, lowercase",
};

it("reports the wizard off without touching the database", async () => {
  const { actor } = await setup({ on: [] });

  expect(await onboardingStatus(actor)).toEqual({ enabled: false });
  await expect(saveBrand(actor, brand)).rejects.toMatchObject({ status: 404 });
  await expect(
    resolveBrandReferences(actor, ["Wes Anderson"])
  ).rejects.toMatchObject({ status: 404 });
});

it("shows each connection's health and what a drop still needs", async () => {
  const { actor, db } = await setup();
  await db.insert(connection).values({
    needsReconnect: true,
    provider: "meta",
    sealedTokens: "sealed",
    userId: USER_ID,
  });

  const status = await onboardingStatus(actor);

  expect(status).toMatchObject({
    canStartDrop: false,
    connections: [
      { provider: "fal", required: true, state: "missing" },
      { provider: "fourthwall", required: true, state: "missing" },
      { provider: "meta", required: false, state: "expired" },
    ],
    enabled: true,
    steps: { autonomy: false, brand: false, connect: false },
    wovainDraws: false,
  });
});

it("drops fal from the list while wovain draws on its own key", async () => {
  const { actor, db } = await setup({ falKey: vi.fn() });
  await db.insert(connection).values({
    provider: "fourthwall",
    sealedTokens: "sealed",
    userId: USER_ID,
  });

  const status = await onboardingStatus(actor);

  expect(status).toMatchObject({
    canStartDrop: true,
    wovainDraws: true,
  });
  expect(
    "connections" in status
      ? status.connections.map((each) => each.provider)
      : []
  ).toEqual(["fourthwall", "meta"]);
});

it("saves the brand profile and writes it to the taste memory", async () => {
  const { actor, db, memory } = await setup();

  expect(await saveBrand(actor, brand)).toEqual({
    remembered: true,
    saved: true,
  });
  await saveBrand(actor, { ...brand, voice: "loud" });

  const rows = await db.select().from(brandProfile);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    niches: ["y2k racing"],
    qlooEntities: brand.qlooEntities,
    tasteReferences: brand.tasteReferences,
    voice: "loud",
  });
  expect(memory.updateWorkingMemory).toHaveBeenLastCalledWith(
    expect.objectContaining({
      workingMemory: expect.stringContaining("- Voice: loud"),
    })
  );
  const status = await onboardingStatus(actor);
  expect(status).toMatchObject({ steps: { brand: true } });
});

it("draws on wovain's fal key only while the flag is on", async () => {
  const falKey = vi.fn(async () => await Promise.resolve({ ok: true }));
  const on = await setup({ falKey });

  await expect(requireFal(on.actor)).resolves.toBeUndefined();
  expect(
    await withArtistCall(on.actor, async (call) => await call("x", {}))
  ).toEqual({
    ok: true,
  });

  const off = await setup({ falKey, on: [] });
  await expect(requireFal(off.actor)).rejects.toMatchObject({
    code: "FAL_NOT_CONNECTED",
  });
});
