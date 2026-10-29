import {
  SETTLEMENT_ENVIRONMENTS,
  applySettlements,
} from "@wovain/billing/settlements";
import { createDb } from "@wovain/db";

// `pnpm --filter @wovain/api billing:settle`: applies the credit settlements
// of this environment (packages/billing/src/settlements.ts), run by the
// deploy after the migrations. SETTLEMENT_ENVIRONMENT names the environment
// whose database DATABASE_URL is. Exits non-zero when it fails.

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL isn't set");
}
const environment = SETTLEMENT_ENVIRONMENTS.find(
  (name) => name === process.env["SETTLEMENT_ENVIRONMENT"]
);
if (environment === undefined) {
  throw new Error(
    `SETTLEMENT_ENVIRONMENT must be one of ${SETTLEMENT_ENVIRONMENTS.join(", ")}`
  );
}
const db = createDb({ DATABASE_URL: url });
const credited = await applySettlements(db, environment);
await db.$client.end();
process.stdout.write(`Credit settlements applied: ${credited.length}\n`);
