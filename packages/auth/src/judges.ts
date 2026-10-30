import { randomBytes } from "node:crypto";

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@wovain/db";
import * as schema from "@wovain/db/schema/auth";
import {
  auditEvent,
  autonomySetting,
  brandProfile,
} from "@wovain/db/schema/autonomy";
import { creditGrant } from "@wovain/db/schema/billing";
import { betterAuth } from "better-auth";
import { and, eq, isNull, sql } from "drizzle-orm";

import { authLogger } from "./index";

// The hackathon judges' shared demo account (openspec judges-demo-account),
// seeded by `pnpm --filter @wovain/auth seed:judges --env next|nebius|dev`
// (./seed-judges.ts). The account is made through Better Auth's server API
// with its email already verified, and lands on the overview with a sample
// brand and the draft autonomy level. Its credits come only from the
// `judges-account-2026` promo (infra/next/Pulumi.next.yaml), which only this
// email can redeem, through Polar's webhook like any other.

export const JUDGES_EMAIL = "judges@wovain.com";
const JUDGES_NAME = "Hackathon judges";

export const SEED_ENVIRONMENTS = ["next", "nebius", "dev"] as const;
export type SeedEnvironment = (typeof SEED_ENVIRONMENTS)[number];

export const isSeedEnvironment = (value: string): value is SeedEnvironment =>
  (SEED_ENVIRONMENTS as readonly string[]).includes(value);

// Production's database, as infra/index.ts declares it: the Cloud SQL
// instance `wovain`, its database and user `wovain`, and the `database-url`
// secret that holds the URL. dev.wovain.com's database lives on that same
// instance, so it is refused too. judges.test.ts checks these against infra.
export const PRODUCTION_DATABASE = {
  database: "wovain",
  instance: "wovain",
  secret: "database-url",
  user: "wovain",
} as const;

// next.wovain.com's and nebius.wovain.com's own (infra/dev.ts
// appEnvironment, named after the stack).
const cloudDatabase = <Name extends string>(name: Name) =>
  ({
    database: `wovain_${name}`,
    instance: `wovain-${name}`,
    secret: `database-url-${name}`,
  }) as const;
export const NEXT_DATABASE = cloudDatabase("next");
const CLOUD_DATABASES = {
  nebius: cloudDatabase("nebius"),
  next: NEXT_DATABASE,
} as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export interface SeedArgs {
  env: string | undefined;
  // Sets a new password on an account that already exists.
  resetPassword: boolean;
}

export const parseSeedArgs = (argv: readonly string[]): SeedArgs => {
  const args = argv.filter((arg) => arg !== "--");
  const inline = args.find((arg) => arg.startsWith("--env="));
  return {
    env:
      inline === undefined
        ? args[args.indexOf("--env") + 1]
        : inline.slice("--env=".length),
    resetPassword: args.includes("--reset-password"),
  };
};

const CLOUD_SQL_SOCKET = /^\/cloudsql\/[^:]+:[^:]+:(?<instance>[^/]+)$/u;

export interface SeedTarget {
  databaseUrl: string | undefined;
  // The Secret Manager id the URL was read from, when the caller says.
  databaseUrlSecret?: string | undefined;
  env: string | undefined;
}

// What a database URL points at.
interface UrlTarget {
  database: string;
  host: string;
  // The Cloud SQL instance it reaches through a /cloudsql/<connection name>
  // socket (project:region:instance), if it names one.
  instance: string | undefined;
  user: string;
}

const parseUrl = (databaseUrl: string): UrlTarget | string => {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return "DATABASE_URL isn't a valid URL.";
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    return "DATABASE_URL isn't a Postgres URL.";
  }
  return {
    database: decodeURIComponent(url.pathname.slice(1)),
    host: url.hostname,
    instance: CLOUD_SQL_SOCKET.exec(url.searchParams.get("host") ?? "")
      ?.groups?.["instance"],
    user: decodeURIComponent(url.username),
  };
};

const productionRefusal = (
  target: UrlTarget,
  secret: string | undefined
): string | undefined => {
  if (secret === PRODUCTION_DATABASE.secret) {
    return `DATABASE_URL comes from production's secret (${PRODUCTION_DATABASE.secret}).`;
  }
  if (target.instance === PRODUCTION_DATABASE.instance) {
    return `DATABASE_URL reaches production's Cloud SQL instance (${PRODUCTION_DATABASE.instance}).`;
  }
  if (target.user === PRODUCTION_DATABASE.user) {
    return `DATABASE_URL signs in as production's database user (${PRODUCTION_DATABASE.user}).`;
  }
};

const cloudRefusal = (
  env: keyof typeof CLOUD_DATABASES,
  target: UrlTarget,
  secret: string | undefined
): string | undefined => {
  const own = CLOUD_DATABASES[env];
  if (target.database !== own.database) {
    return `--env ${env} needs ${env}'s database (${own.database}), not ${target.database || "none"}.`;
  }
  if (target.instance !== undefined && target.instance !== own.instance) {
    return `--env ${env} needs ${env}'s instance (${own.instance}), not ${target.instance}.`;
  }
  if (secret !== undefined && secret !== own.secret) {
    return `--env ${env} needs ${env}'s secret (${own.secret}), not ${secret}.`;
  }
};

const devRefusal = (target: UrlTarget): string | undefined =>
  target.instance === undefined && LOCAL_HOSTS.has(target.host)
    ? undefined
    : "--env dev seeds a local database only (localhost).";

// Why the seed won't touch this database, before connecting to it; undefined
// when it may go on. Anything that looks like production is refused.
export const refusalOf = ({
  databaseUrl,
  databaseUrlSecret,
  env,
}: SeedTarget): string | undefined => {
  if (env === undefined || !isSeedEnvironment(env)) {
    return `Pass --env next, --env nebius or --env dev (got ${env ?? "nothing"}). The seed never runs on production.`;
  }
  if (databaseUrl === undefined || databaseUrl === "") {
    return "DATABASE_URL isn't set.";
  }
  const target = parseUrl(databaseUrl);
  if (typeof target === "string") {
    return target;
  }
  return (
    productionRefusal(target, databaseUrlSecret) ??
    (env === "dev"
      ? devRefusal(target)
      : cloudRefusal(env, target, databaseUrlSecret))
  );
};

// What the database itself says it is, read once connected.
export interface TargetFacts {
  // Cloud SQL makes the cloudsqlsuperuser role on every instance.
  cloudSql: boolean;
  database: string;
}

export const targetFacts = async (db: Database): Promise<TargetFacts> => {
  const result = await db.execute<{ cloud_sql: boolean; database: string }>(
    sql`select current_database() as database, exists (select 1 from pg_roles where rolname = 'cloudsqlsuperuser') as cloud_sql`
  );
  const [row] = result.rows;
  if (row === undefined) {
    throw new Error("The database didn't say which one it is");
  }
  return { cloudSql: row.cloud_sql, database: row.database };
};

// The same guard, on what the server answered rather than on the URL.
export const liveRefusalOf = (
  env: SeedEnvironment,
  facts: TargetFacts
): string | undefined => {
  if (facts.cloudSql && facts.database === PRODUCTION_DATABASE.database) {
    return `The server is a Cloud SQL instance holding production's database (${PRODUCTION_DATABASE.database}).`;
  }
  if (env !== "dev" && !facts.cloudSql) {
    return `--env ${env} connected to a database that isn't on Cloud SQL.`;
  }
  if (env !== "dev" && facts.database !== CLOUD_DATABASES[env].database) {
    return `--env ${env} connected to ${facts.database}, not ${env}'s database (${CLOUD_DATABASES[env].database}).`;
  }
  if (env === "dev" && facts.cloudSql) {
    return "--env dev connected to a Cloud SQL instance; it seeds a local database only.";
  }
};

// A sample brand, so the judges reach a first drop without the wizard.
const JUDGES_BRAND = {
  demographics: {
    ageMax: 38,
    ageMin: 22,
    countries: ["US", "CA", "GB"],
    genders: ["all" as const],
  },
  displayName: "Night Shift Supply",
  niches: ["city pop", "y2k racing", "late-night diners"],
  palette: ["#1A1A1A", "#F2EDE4", "#C8553D", "#2E5266"],
  tasteReferences: ["Tatsuro Yamashita", "Akira", "Initial D", "Wong Kar-wai"],
  voice: "dry, lowercase, no emoji",
};

// The settings @wovain/core/autonomy reads, as the table stores them.
type AutonomySettings = Pick<
  typeof autonomySetting.$inferSelect,
  "dailySpendCapCents" | "level" | "monthlySpendCapCents" | "paused"
>;

// Drafts only (hidden products, paused campaigns), with a small spend cap.
export const JUDGES_AUTONOMY: AutonomySettings = {
  dailySpendCapCents: 500,
  level: "draft",
  monthlySpendCapCents: 2000,
  paused: false,
};

const PASSWORD_BYTES = 24;
const SECRET_BYTES = 32;

// 32 URL-safe characters, 192 random bits.
const newPassword = () => randomBytes(PASSWORD_BYTES).toString("base64url");

// Better Auth on the app's tables with the app's password hashing (its
// default scrypt) and none of its plugins: nothing here signs a session or
// sends an email, so a throwaway secret will do.
const seedAuth = (db: Database) =>
  betterAuth({
    baseURL: "http://localhost",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { autoSignIn: false, enabled: true },
    logger: authLogger,
    secret: randomBytes(SECRET_BYTES).toString("hex"),
    telemetry: { enabled: false },
    user: {
      additionalFields: {
        locale: { input: true, required: false, type: "string" },
      },
    },
  });

export interface SeedResult {
  created: boolean;
  // Set only when this run chose a password: printed once, stored nowhere.
  password?: string | undefined;
  userId: string;
}

export interface SeedAccount {
  email: string;
  name: string;
  // A password chosen by the caller, set on every run; else one is chosen
  // for a new account, or for an existing one with resetPassword.
  password?: string | undefined;
  resetPassword?: boolean | undefined;
}

// A verified email-and-password account, created or brought in line.
export const ensureAccount = async (
  db: Database,
  { email, name, password: given, resetPassword = false }: SeedAccount
): Promise<SeedResult> => {
  const auth = seedAuth(db);
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(email, {
    includeAccounts: true,
  });
  if (found === null) {
    const password = given ?? newPassword();
    const { user } = await auth.api.signUpEmail({
      body: { email, locale: "en", name, password },
    });
    await context.internalAdapter.updateUser(user.id, { emailVerified: true });
    return { created: true, password, userId: user.id };
  }
  const { accounts, user } = found;
  if (!user.emailVerified) {
    await context.internalAdapter.updateUser(user.id, { emailVerified: true });
  }
  const credential = accounts.find(
    (account) => account.providerId === "credential"
  );
  if (given === undefined && !resetPassword && credential !== undefined) {
    return { created: false, userId: user.id };
  }
  const password = given ?? newPassword();
  const hash = await context.password.hash(password);
  await (credential === undefined
    ? context.internalAdapter.linkAccount({
        accountId: user.id,
        password: hash,
        providerId: "credential",
        userId: user.id,
      })
    : context.internalAdapter.updatePassword(user.id, hash));
  // Whoever signed in with the old password is signed out.
  await context.internalAdapter.deleteUserSessions(user.id);
  return { created: false, password, userId: user.id };
};

// The brand is added once and the judges' own edits are kept; the overview
// stops sending them to the wizard. A run that finds both in place writes
// nothing.
const ensureBrand = async (db: Database, userId: string, now: Date) => {
  await db
    .insert(brandProfile)
    .values({ ...JUDGES_BRAND, onboardedAt: now, userId })
    .onConflictDoNothing({ target: brandProfile.userId });
  await db
    .update(brandProfile)
    .set({ onboardedAt: now })
    .where(
      and(eq(brandProfile.userId, userId), isNull(brandProfile.onboardedAt))
    );
};

const sameAutonomy = (a: AutonomySettings, b: AutonomySettings) =>
  a.level === b.level &&
  a.dailySpendCapCents === b.dailySpendCapCents &&
  a.monthlySpendCapCents === b.monthlySpendCapCents &&
  a.paused === b.paused;

// Drafts with a small cap, set back on every run (the cap keeps a shared
// account cheap), and audited like a change from Settings.
const ensureAutonomy = async (db: Database, userId: string) => {
  const [row] = await db
    .select()
    .from(autonomySetting)
    .where(eq(autonomySetting.userId, userId));
  const before: AutonomySettings | null =
    row === undefined
      ? null
      : {
          dailySpendCapCents: row.dailySpendCapCents,
          level: row.level,
          monthlySpendCapCents: row.monthlySpendCapCents,
          paused: row.paused,
        };
  if (before !== null && sameAutonomy(before, JUDGES_AUTONOMY)) {
    return;
  }
  await db
    .insert(autonomySetting)
    .values({ ...JUDGES_AUTONOMY, userId })
    .onConflictDoUpdate({
      set: JUDGES_AUTONOMY,
      target: autonomySetting.userId,
    });
  await db.insert(auditEvent).values({
    actor: "seed:judges",
    after: JUDGES_AUTONOMY,
    approvalId: null,
    before,
    event: "settings_changed",
    note: "judges demo account",
    userId,
  });
};

// nebius has no Polar, so no plan or promo credits ever reach its ledger:
// the judges get the judges-account-2026 promo's 300 credits as one grant
// on nebius's own ledger, made once (a rerun leaves what they spent).
export const NEBIUS_JUDGES_CREDITS = 300;
const NEBIUS_JUDGES_GRANT = "judges-nebius-credits";

const ensureCredits = async (db: Database, userId: string) => {
  await db
    .insert(creditGrant)
    .values({
      id: NEBIUS_JUDGES_GRANT,
      periodKey: NEBIUS_JUDGES_GRANT,
      remaining: NEBIUS_JUDGES_CREDITS,
      rollover: true,
      source: "pack",
      userId,
    })
    .onConflictDoNothing({ target: creditGrant.id });
};

// Idempotent: a second run changes nothing but a drifted autonomy setting,
// and chooses a password only for a new account or with resetPassword.
export const seedJudges = async (
  db: Database,
  {
    env,
    now = new Date(),
    resetPassword = false,
  }: { env?: SeedEnvironment; now?: Date; resetPassword?: boolean } = {}
): Promise<SeedResult> => {
  const result = await ensureAccount(db, {
    email: JUDGES_EMAIL,
    name: JUDGES_NAME,
    resetPassword,
  });
  await ensureBrand(db, result.userId, now);
  await ensureAutonomy(db, result.userId);
  if (env === "nebius") {
    await ensureCredits(db, result.userId);
  }
  return result;
};
