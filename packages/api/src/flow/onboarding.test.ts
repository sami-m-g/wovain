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
  finishOnboarding,
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
const KNOWN = new Set(["Wes Anderson", "Studio Ghibli", "Kenzo", "Prada"]);

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
  // Qloo knows the names in KNOWN; the web knows nothing, so the rest come
  // back unresolved without asking Nemotron.
  const search = vi.fn(
    async (name: string) =>
      await Promise.resolve(
        KNOWN.has(name)
          ? [{ id: `Q-${name}`, name, type: "urn:entity:brand" }]
          : []
      )
  );
  const web = {
    search: vi.fn(async () => await Promise.resolve({ results: [] })),
  };
  const nemotron = vi.fn();
  const actor = {
    core: {
      falKey,
      flags: {
        isOn: async (name: FlagName) =>
          await Promise.resolve(on.includes(name)),
      },
      memory,
      nemotron,
      qloo: { search },
      tavily: web,
    },
    db: db as unknown as Database,
    userId: USER_ID,
  } as unknown as Actor;
  return { actor, db, memory, search, web };
};

const brand = {
  niches: ["y2k racing"],
  palette: ["#1A1A1A"],
  tasteReferences: ["Wes Anderson", "Kenzo", "Studio Ghibli"],
  voice: "dry, lowercase",
};

const entityIds = async (db: Awaited<ReturnType<typeof setup>>["db"]) => {
  const [row] = await db.select().from(brandProfile);
  return row?.qlooEntities.map((entity) => entity.id);
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

  expect(await saveBrand(actor, brand)).toMatchObject({
    remembered: true,
    saved: true,
  });
  await saveBrand(actor, { ...brand, voice: "loud" });

  const rows = await db.select().from(brandProfile);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    niches: ["y2k racing"],
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

it("resolves the references on save when the designer never ran Resolve", async () => {
  const { actor, db, search } = await setup();

  const saved = await saveBrand(actor, brand);

  expect(saved.references.map((one) => one.status)).toEqual([
    "direct",
    "direct",
    "direct",
  ]);
  expect(await entityIds(db)).toEqual([
    "Q-Wes Anderson",
    "Q-Kenzo",
    "Q-Studio Ghibli",
  ]);
  expect(search).toHaveBeenCalledTimes(3);
});

it("saves only the entities of the references being saved", async () => {
  const { actor, db } = await setup();
  await resolveBrandReferences(actor, brand.tasteReferences);
  await saveBrand(actor, brand);

  // Kenzo is swapped for Prada after the first save.
  await saveBrand(actor, {
    ...brand,
    tasteReferences: ["Wes Anderson", "Prada", "Studio Ghibli"],
  });

  expect(await entityIds(db)).toEqual([
    "Q-Wes Anderson",
    "Q-Prada",
    "Q-Studio Ghibli",
  ]);
});

it("ignores Qloo entities the client sends", async () => {
  const { actor, db } = await setup();

  await saveBrand(actor, {
    ...brand,
    qlooEntities: [{ id: "invented", name: "Fake", type: "urn:entity:x" }],
  } as typeof brand);

  expect(await entityIds(db)).not.toContain("invented");
});

it("answers repeat lookups from the cache, in any spelling", async () => {
  const { actor, search, web } = await setup();
  await resolveBrandReferences(actor, ["Wes Anderson", "Nobody Knows"]);
  search.mockClear();
  web.search.mockClear();

  const again = await resolveBrandReferences(actor, [
    " wes anderson",
    "Nobody Knows",
  ]);
  await saveBrand(actor, {
    ...brand,
    tasteReferences: ["Wes Anderson", "nobody knows", "WES ANDERSON"],
  });

  expect(again).toMatchObject([
    { reference: "wes anderson", status: "direct" },
    { reference: "Nobody Knows", status: "unresolved" },
  ]);
  expect(search).not.toHaveBeenCalled();
  expect(web.search).not.toHaveBeenCalled();
});

// Five references Qloo and the web don't know.
const names = (from: number) =>
  Array.from({ length: 5 }, (_, index) => `Ref ${from + index}`);

it("limits the new lookups a merchant starts each hour", async () => {
  const { actor, search } = await setup();
  for (const from of [0, 5, 10, 15]) {
    // oxlint-disable-next-line no-await-in-loop
    await resolveBrandReferences(actor, names(from));
  }
  search.mockClear();

  await expect(resolveBrandReferences(actor, names(20))).rejects.toMatchObject({
    status: 429,
  });
  expect(search).not.toHaveBeenCalled();
  // What's cached still answers.
  await expect(resolveBrandReferences(actor, names(0))).resolves.toHaveLength(
    5
  );
});

it("remembers that the merchant reached the last step", async () => {
  const { actor, db } = await setup();
  expect(await onboardingStatus(actor)).toMatchObject({ finished: false });

  await finishOnboarding(actor);
  const [first] = await db.select().from(brandProfile);
  await saveBrand(actor, brand);
  await finishOnboarding(actor);

  const [row] = await db.select().from(brandProfile);
  expect(row?.onboardedAt).toEqual(first?.onboardedAt);
  expect(await onboardingStatus(actor)).toMatchObject({
    finished: true,
    steps: { brand: true },
  });
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
