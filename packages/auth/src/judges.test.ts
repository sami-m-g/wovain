import { readFileSync } from "node:fs";

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { createTestDb } from "@wovain/billing/testing";
import type { Database } from "@wovain/db";
import { account, session, user } from "@wovain/db/schema/auth";
import * as schema from "@wovain/db/schema/auth";
import {
  auditEvent,
  autonomySetting,
  brandProfile,
} from "@wovain/db/schema/autonomy";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

import {
  JUDGES_AUTONOMY,
  JUDGES_EMAIL,
  NEXT_DATABASE,
  PRODUCTION_DATABASE,
  liveRefusalOf,
  parseSeedArgs,
  refusalOf,
  seedJudges,
  targetFacts,
} from "./judges";

// The judges' demo account seed: its guard, which refuses production's
// database however it is named, and a seed that can run any number of times.

const NEXT_URL =
  "postgresql://wovain_next:pw@localhost/wovain_next?host=/cloudsql/wovain:us-central1:wovain-next";
const PROD_URL =
  "postgresql://wovain:pw@localhost/wovain?host=/cloudsql/wovain:us-central1:wovain";
const LOCAL_URL = "postgresql://postgres:password@localhost:5432/wovain";

it("reads --env and --reset-password, with or without pnpm's --", () => {
  expect(parseSeedArgs(["--env", "next"])).toStrictEqual({
    env: "next",
    resetPassword: false,
  });
  expect(parseSeedArgs(["--", "--env=dev", "--reset-password"])).toStrictEqual({
    env: "dev",
    resetPassword: true,
  });
  expect(parseSeedArgs([])).toStrictEqual({
    env: undefined,
    resetPassword: false,
  });
});

it("refuses to run without an explicit --env next or dev", () => {
  for (const env of [undefined, "", "prod", "production", "NEXT"]) {
    expect(refusalOf({ databaseUrl: NEXT_URL, env })).toMatch(
      /Pass --env next, --env nebius or --env dev/u
    );
  }
});

it("refuses production's database, whatever --env says", () => {
  for (const env of ["next", "dev"]) {
    // Its socket, its user, the secret it was read from.
    expect(refusalOf({ databaseUrl: PROD_URL, env })).toMatch(/production/u);
    expect(
      refusalOf({
        databaseUrl: "postgresql://wovain:pw@localhost:5433/wovain_next",
        env,
      })
    ).toMatch(/production's database user/u);
    expect(
      refusalOf({
        databaseUrl: NEXT_URL,
        databaseUrlSecret: PRODUCTION_DATABASE.secret,
        env,
      })
    ).toMatch(/production's secret/u);
  }
  // dev.wovain.com's database lives on production's instance.
  expect(
    refusalOf({
      databaseUrl:
        "postgresql://wovain_dev:pw@localhost/wovain_dev?host=/cloudsql/wovain:us-central1:wovain",
      env: "dev",
    })
  ).toMatch(/production's Cloud SQL instance/u);
});

it("holds --env next to next's database, instance and secret", () => {
  expect(refusalOf({ databaseUrl: NEXT_URL, env: "next" })).toBeUndefined();
  expect(
    refusalOf({
      databaseUrl: NEXT_URL,
      databaseUrlSecret: NEXT_DATABASE.secret,
      env: "next",
    })
  ).toBeUndefined();
  // Through a TCP proxy: no socket to read the instance from.
  expect(
    refusalOf({
      databaseUrl: "postgresql://wovain_next:pw@127.0.0.1:5433/wovain_next",
      env: "next",
    })
  ).toBeUndefined();
  expect(refusalOf({ databaseUrl: LOCAL_URL, env: "next" })).toMatch(
    /next's database/u
  );
  expect(
    refusalOf({
      databaseUrl:
        "postgresql://wovain_next:pw@localhost/wovain_next?host=/cloudsql/wovain:us-central1:other",
      env: "next",
    })
  ).toMatch(/next's instance/u);
  expect(
    refusalOf({
      databaseUrl: NEXT_URL,
      databaseUrlSecret: "database-url-dev",
      env: "next",
    })
  ).toMatch(/next's secret/u);
});

it("holds --env nebius to nebius's database, never next's", () => {
  expect(
    refusalOf({
      databaseUrl: NEXT_URL.replaceAll("next", "nebius"),
      databaseUrlSecret: "database-url-nebius",
      env: "nebius",
    })
  ).toBeUndefined();
  expect(refusalOf({ databaseUrl: NEXT_URL, env: "nebius" })).toMatch(
    /nebius's database/u
  );
});

it("holds --env dev to a local database", () => {
  expect(refusalOf({ databaseUrl: LOCAL_URL, env: "dev" })).toBeUndefined();
  expect(refusalOf({ databaseUrl: NEXT_URL, env: "dev" })).toMatch(
    /local database only/u
  );
  expect(
    refusalOf({
      databaseUrl: "postgresql://postgres:pw@db.example.com/wovain",
      env: "dev",
    })
  ).toMatch(/local database only/u);
});

it("refuses a missing or malformed DATABASE_URL", () => {
  expect(refusalOf({ databaseUrl: undefined, env: "dev" })).toMatch(
    /isn't set/u
  );
  expect(refusalOf({ databaseUrl: "not a url", env: "dev" })).toMatch(
    /valid URL/u
  );
  expect(
    refusalOf({ databaseUrl: "mysql://root@localhost/wovain", env: "dev" })
  ).toMatch(/Postgres URL/u);
});

it("checks again on what the server says it is", () => {
  expect(liveRefusalOf("next", { cloudSql: true, database: "wovain" })).toMatch(
    /production's database/u
  );
  expect(
    liveRefusalOf("next", { cloudSql: true, database: "wovain_next" })
  ).toBeUndefined();
  expect(
    liveRefusalOf("next", { cloudSql: false, database: "postgres" })
  ).toMatch(/not next's database/u);
  expect(
    liveRefusalOf("dev", { cloudSql: true, database: "wovain_dev" })
  ).toMatch(/Cloud SQL/u);
  expect(
    liveRefusalOf("dev", { cloudSql: false, database: "wovain" })
  ).toBeUndefined();
});

const readInfra = (path: string) =>
  readFileSync(new URL(`../../../infra/${path}`, import.meta.url), "utf-8");

// The guard's names are infra's: a rename there must fail here.
it("names production's and next's databases as infra declares them", () => {
  const prod = readInfra("index.ts");
  expect(prod).toContain(
    `postgresInstance("postgres", "${PRODUCTION_DATABASE.instance}"`
  );
  expect(prod).toContain(
    `{ instance: sql.name, name: "${PRODUCTION_DATABASE.database}" }`
  );
  expect(prod).toContain(`name: "${PRODUCTION_DATABASE.user}",`);
  expect(prod).toContain(`"${PRODUCTION_DATABASE.secret}",`);
  const next = readInfra("dev.ts");
  expect(next).toMatch(
    /postgresInstance\(`postgres-\$\{name\}`, `wovain-\$\{name\}`/u
  );
  expect(next).toMatch(/name: `wovain_\$\{name\}`/u);
  expect(next).toContain('"database-url"');
  expect(NEXT_DATABASE).toStrictEqual({
    database: "wovain_next",
    instance: "wovain-next",
    secret: "database-url-next",
  });
});

let db: Database;
let close: () => Promise<void>;
let reset: () => Promise<void>;

beforeAll(async () => {
  ({ close, db, reset } = await createTestDb());
});

beforeEach(async () => {
  await reset();
});

afterAll(async () => {
  await close();
});

const rowsFor = async (userId: string) => ({
  accounts: await db.select().from(account).where(eq(account.userId, userId)),
  audit: await db
    .select()
    .from(auditEvent)
    .where(eq(auditEvent.userId, userId)),
  autonomy: await db
    .select()
    .from(autonomySetting)
    .where(eq(autonomySetting.userId, userId)),
  brand: await db
    .select()
    .from(brandProfile)
    .where(eq(brandProfile.userId, userId)),
  users: await db.select().from(user).where(eq(user.email, JUDGES_EMAIL)),
});

// Signs in the way the app does: Better Auth's email sign-in on the same
// tables, with verified emails required.
const signIn = async (password: string) => {
  const auth = betterAuth({
    baseURL: "http://localhost",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    secret: "test-secret-test-secret-test-secret-32",
    telemetry: { enabled: false },
  });
  return await auth.api.signInEmail({
    body: { email: JUDGES_EMAIL, password },
  });
};

it("reports the test database as local, not next", async () => {
  expect(await targetFacts(db)).toStrictEqual({
    cloudSql: false,
    database: "postgres",
  });
});

it("creates a verified, ready account and prints its password once", async () => {
  const first = await seedJudges(db);
  expect(first.created).toBe(true);
  expect(first.password).toMatch(/^[\w-]{32}$/u);
  const rows = await rowsFor(first.userId);
  expect(rows.users).toMatchObject([{ emailVerified: true, locale: "en" }]);
  expect(rows.accounts).toMatchObject([{ providerId: "credential" }]);
  expect(rows.brand).toMatchObject([
    { displayName: "Night Shift Supply", tasteReferences: expect.any(Array) },
  ]);
  expect(rows.brand[0]?.onboardedAt).toBeInstanceOf(Date);
  expect(rows.autonomy).toMatchObject([JUDGES_AUTONOMY]);
  expect(rows.audit).toMatchObject([
    { actor: "seed:judges", after: JUDGES_AUTONOMY, event: "settings_changed" },
  ]);
  const signedIn = await signIn(first.password ?? "");
  expect(signedIn.user.email).toBe(JUDGES_EMAIL);
});

it("changes nothing on a second run, and keeps the password", async () => {
  const first = await seedJudges(db);
  const before = await rowsFor(first.userId);
  const second = await seedJudges(db);
  expect(second).toStrictEqual({ created: false, userId: first.userId });
  const after = await rowsFor(first.userId);
  expect(after).toStrictEqual(before);
  const signedIn = await signIn(first.password ?? "");
  expect(signedIn.user.id).toBe(first.userId);
});

it("keeps the judges' brand edits and resets a drifted autonomy", async () => {
  const { userId } = await seedJudges(db);
  await db
    .update(brandProfile)
    .set({ voice: "loud" })
    .where(eq(brandProfile.userId, userId));
  await db
    .update(autonomySetting)
    .set({ dailySpendCapCents: 100_000, level: "publish_ads_paused" })
    .where(eq(autonomySetting.userId, userId));
  await seedJudges(db);
  const rows = await rowsFor(userId);
  expect(rows.brand).toMatchObject([{ voice: "loud" }]);
  expect(rows.autonomy).toMatchObject([JUDGES_AUTONOMY]);
  expect(rows.audit).toHaveLength(2);
});

it("sets a new password only when asked, and signs the old one out", async () => {
  const first = await seedJudges(db);
  await signIn(first.password ?? "");
  const again = await seedJudges(db, { resetPassword: true });
  expect(again.created).toBe(false);
  expect(again.password).toBeDefined();
  expect(again.password).not.toBe(first.password);
  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.userId, first.userId));
  expect(sessions).toStrictEqual([]);
  await expect(signIn(first.password ?? "")).rejects.toThrow();
  const signedIn = await signIn(again.password ?? "");
  expect(signedIn.user.id).toBe(first.userId);
  const { accounts } = await rowsFor(first.userId);
  expect(accounts).toHaveLength(1);
});
