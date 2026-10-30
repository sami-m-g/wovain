import {
  ensureAccount,
  liveRefusalOf,
  refusalOf,
  targetFacts,
} from "@wovain/auth/judges";
import { createDb } from "@wovain/db";
import { creditGrant } from "@wovain/db/schema/billing";
import { log } from "evlog";

// The post-deploy smoke suite's account on the deployed target's site
// (next.wovain.com or nebius.wovain.com), run by deploy.yml before the
// suite, which sets SMOKE_ENV to its target:
//
//   DATABASE_URL=... DATABASE_URL_SECRET=database-url-next \
//   E2E_PASSWORD=... pnpm --filter @wovain/e2e seed:smoke
//
// E2E_PASSWORD is the e2e-smoke-password-next secret, which Pulumi
// generates (infra/next/index.ts); every run sets it, so the account always
// matches the secret. Like the judges' seed (packages/auth/src/judges.ts),
// it refuses production's database before connecting and once connected.
const SMOKE_EMAIL = "e2e-smoke@wovain.com";
const SMOKE_ENV = process.env["SMOKE_ENV"] === "nebius" ? "nebius" : "next";
// Each run's research and designs spend credits (BILLING_CATALOG): the
// account's own grant is topped up to this on every deploy, so the suite
// never stops at a paywall. On the target's own ledger; no Polar customer
// pays.
const SMOKE_CREDITS = 100;
const SMOKE_GRANT = "e2e-smoke-credits";

const fail = (code: string, reason: string) => {
  log.error({ error: { code, message: reason, name: "SmokeSeedError" } });
  process.exitCode = 1;
};

const run = async () => {
  const databaseUrl = process.env["DATABASE_URL"];
  const password = process.env["E2E_PASSWORD"];
  const refusal = refusalOf({
    databaseUrl,
    databaseUrlSecret: process.env["DATABASE_URL_SECRET"],
    env: SMOKE_ENV,
  });
  if (refusal !== undefined || databaseUrl === undefined || !password) {
    fail("SMOKE_SEED_REFUSED", refusal ?? "Set DATABASE_URL and E2E_PASSWORD.");
    return;
  }
  const db = createDb({ DATABASE_URL: databaseUrl });
  try {
    const live = liveRefusalOf(SMOKE_ENV, await targetFacts(db));
    if (live !== undefined) {
      fail("SMOKE_SEED_REFUSED", live);
      return;
    }
    const { created, userId } = await ensureAccount(db, {
      email: SMOKE_EMAIL,
      name: "wovain smoke test",
      password,
    });
    await db
      .insert(creditGrant)
      .values({
        id: SMOKE_GRANT,
        periodKey: SMOKE_GRANT,
        remaining: SMOKE_CREDITS,
        rollover: true,
        source: "pack",
        userId,
      })
      .onConflictDoUpdate({
        set: { remaining: SMOKE_CREDITS, revokedAt: null },
        target: creditGrant.id,
      });
    log.info({ smokeSeed: { created, credits: SMOKE_CREDITS, userId } });
  } finally {
    await db.$client.end();
  }
};

try {
  await run();
} catch (error) {
  fail(
    "SMOKE_SEED_FAILED",
    error instanceof Error ? error.message : String(error)
  );
}
