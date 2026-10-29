import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { call, ORPCError } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";
import type { Database } from "@wovain/db";
import { relations } from "@wovain/db/relations";
import { user } from "@wovain/db/schema/auth";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "./index";

// What a signed-in merchant gets back from the read procedures each screen
// opens with, on real Postgres (PGlite, with the app's migrations), with
// every flag on and then off. One database for the file: these only read.

const MIGRATIONS = fileURLToPath(
  new URL("../../../db/src/migrations", import.meta.url)
);
const USER_ID = "user_1";

let db: Database;

beforeAll(async () => {
  const client = new PGlite();
  const pg = drizzle({ client, relations });
  await migrate(pg, { migrationsFolder: MIGRATIONS });
  await pg.insert(user).values({
    email: "designer@example.com",
    emailVerified: true,
    id: USER_ID,
    name: "Designer",
  });
  db = pg as unknown as Database;
});

const as = (flagsOn: boolean) => ({
  context: {
    billing: {
      appUrl: "https://wovain.test",
      paidPlans: async () => await Promise.resolve(false),
      polar: undefined,
    },
    core: {
      flags: { isOn: async () => await Promise.resolve(flagsOn) },
    },
    db,
    session: { user: { id: USER_ID } },
  } as never,
});

const outcome = async (
  procedure: AnyProcedure,
  input: unknown,
  on: boolean
) => {
  try {
    return { ok: await call(procedure, input as never, as(on)) };
  } catch (error) {
    if (error instanceof ORPCError) {
      return { code: error.code, status: error.status };
    }
    throw error;
  }
};

// A flag-gated procedure answers 404 while its flag is off.
const GATED = expect.objectContaining({ status: 404 });
const FREE = {
  credits: { available: 0, pack: 0, plan: 0 },
  enabled: false,
  paidPlans: false,
  plan: "free",
  subscription: null,
};

// [procedure, input, with flags on, with flags off]
const cases: [string, AnyProcedure, unknown, unknown, unknown][] = [
  [
    "onboarding.status",
    appRouter.onboarding.status,
    undefined,
    { ok: expect.objectContaining({ enabled: true }) },
    { ok: { enabled: false } },
  ],
  [
    "connections.list",
    appRouter.connections.list,
    undefined,
    { ok: [] },
    { ok: [] },
  ],
  [
    "billing.status",
    appRouter.billing.status,
    undefined,
    { ok: expect.objectContaining(FREE) },
    { ok: expect.objectContaining(FREE) },
  ],
  [
    "billing.portal",
    appRouter.billing.portal,
    undefined,
    { code: "POLAR_NOT_CONFIGURED", status: 503 },
    { code: "POLAR_NOT_CONFIGURED", status: 503 },
  ],
  [
    "billing.checkout",
    appRouter.billing.checkout,
    { offer: "pack" },
    { code: "PAID_PLANS_NOT_AVAILABLE", status: 403 },
    { code: "PAID_PLANS_NOT_AVAILABLE", status: 403 },
  ],
  [
    "billing.redeem",
    appRouter.billing.redeem,
    { code: "WELCOME" },
    { code: "POLAR_NOT_CONFIGURED", status: 503 },
    { code: "POLAR_NOT_CONFIGURED", status: 503 },
  ],
  [
    "runs.list",
    appRouter.runs.list,
    undefined,
    { ok: expect.any(Array) },
    { ok: expect.any(Array) },
  ],
  ["products.list", appRouter.products.list, undefined, { ok: [] }, { ok: [] }],
  [
    "campaigns.list",
    appRouter.campaigns.list,
    undefined,
    { ok: [] },
    { ok: [] },
  ],
  ["approvals.list", appRouter.approvals.list, {}, { ok: [] }, GATED],
  [
    "autonomy.get",
    appRouter.autonomy.get,
    undefined,
    { ok: expect.objectContaining({ level: expect.any(String) }) },
    GATED,
  ],
  [
    "alerts.settings",
    appRouter.alerts.settings,
    undefined,
    { ok: expect.objectContaining({ on: true }) },
    { ok: { on: false } },
  ],
  [
    "voice.status",
    appRouter.voice.status,
    undefined,
    { ok: { enabled: true } },
    { ok: { enabled: false } },
  ],
  [
    "drops.list",
    appRouter.drops.list,
    undefined,
    { ok: expect.any(Array) },
    GATED,
  ],
  [
    "feedback.learned",
    appRouter.feedback.learned,
    undefined,
    { ok: expect.any(Object) },
    GATED,
  ],
  [
    "autopilot.status",
    appRouter.autopilot.status,
    undefined,
    {
      ok: {
        autonomy: expect.any(Object),
        credits: {
          cap: expect.anything(),
          estimate: expect.any(Number),
          usedToday: expect.any(Number),
        },
        enabled: true,
        entitled: expect.anything(),
        hasBrand: false,
      },
    },
    { ok: { enabled: false } },
  ],
];

describe("read procedures for a signed-in merchant", () => {
  it.each(cases)("%s with flags on", async (_path, procedure, input, on) => {
    expect(await outcome(procedure, input, true)).toEqual(on);
  });

  it.each(cases)(
    "%s with flags off",
    async (_path, procedure, input, _on, off) => {
      expect(await outcome(procedure, input, false)).toEqual(off);
    }
  );
});
