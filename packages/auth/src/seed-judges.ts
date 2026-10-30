import { createDb } from "@wovain/db";
import { log } from "evlog";

import {
  JUDGES_EMAIL,
  isSeedEnvironment,
  liveRefusalOf,
  parseSeedArgs,
  refusalOf,
  seedJudges,
  targetFacts,
} from "./judges";

// The judges' shared demo account (./judges.ts) on next or a local database:
//
//   DATABASE_URL=... pnpm --filter @wovain/auth seed:judges --env next
//
// DATABASE_URL comes from the shell only, never from an env file, so the
// owner names the database on purpose. Set DATABASE_URL_SECRET to the
// Secret Manager id it was read from (database-url-next) and the guard
// checks that too. It refuses production's instance, user, database and
// secret, before connecting and again once connected. `--reset-password`
// sets a new password on the existing account. The password is printed
// once, to stdout, and stored nowhere else.

const refuse = (reason: string) => {
  log.error({ error: "JUDGES_SEED_REFUSED", reason });
  process.exitCode = 1;
};

const run = async () => {
  const args = parseSeedArgs(process.argv.slice(2));
  const databaseUrl = process.env["DATABASE_URL"];
  const refusal = refusalOf({
    databaseUrl,
    databaseUrlSecret: process.env["DATABASE_URL_SECRET"],
    env: args.env,
  });
  const { env } = args;
  if (
    refusal !== undefined ||
    databaseUrl === undefined ||
    env === undefined ||
    !isSeedEnvironment(env)
  ) {
    refuse(
      refusal ??
        "Pass --env next, --env nebius or --env dev, with DATABASE_URL."
    );
    return;
  }
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    const live = liveRefusalOf(env, await targetFacts(db));
    if (live !== undefined) {
      refuse(live);
      return;
    }
    const result = await seedJudges(db, { resetPassword: args.resetPassword });
    const lines = [
      `${JUDGES_EMAIL} ${result.created ? "created" : "already exists"} on ${env} (user ${result.userId}); brand and autonomy (draft) are set.`,
      result.password === undefined
        ? "The password is unchanged. Pass --reset-password to set a new one."
        : `Password, shown only now; copy it into Devpost's testing instructions: ${result.password}`,
    ];
    process.stdout.write(`${lines.join("\n")}\n`);
  } finally {
    await db.$client.end();
  }
};

try {
  await run();
} catch (error) {
  log.error({
    error: {
      code: "JUDGES_SEED_FAILED",
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Error",
      stack: error instanceof Error ? error.stack : undefined,
    },
  });
  process.exitCode = 1;
}
