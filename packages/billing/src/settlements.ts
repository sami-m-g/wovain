import type { Database } from "@wovain/db";
import { log } from "evlog";

import { applyGrant } from "./mirror";

// Credits wovain owes a merchant that no webhook brought: a redemption that
// landed on a Polar customer no live user owned (its grant was skipped), for
// example. Each settlement is reviewed here, in a pull request, and applied
// by the deploy's `billing:settle` step (packages/api) through the ledger's
// own writer, so it is the same grant a webhook would have made.
//
// Idempotent: the grant is `settle:<id>` with a fixed period, so a rerun,
// or a deploy of the same list, changes nothing. A settlement names the
// environment whose database it applies to; every other environment skips
// it. Never edit or reuse an id after it has been deployed.

export const SETTLEMENT_ENVIRONMENTS = ["next", "production"] as const;
export type SettlementEnvironment = (typeof SETTLEMENT_ENVIRONMENTS)[number];

export interface Settlement {
  environment: SettlementEnvironment;
  // The settlement's id, and the key of its grant: `settle:<id>`.
  id: string;
  // The Polar order whose grant was lost, for the audit trail; none when the
  // credits were lost in the app (a failed run kept them, #232).
  polarOrderId?: string | undefined;
  // The promo behind the credits, if they were a redeemed code's: it stops a
  // second redemption of the same promo.
  promoId?: string | undefined;
  reason: string;
  source: "pack" | "plan";
  units: number;
  userId: string;
}

export const SETTLEMENTS: readonly Settlement[] = [
  {
    environment: "next",
    id: "b97c1b60-796b-4014-8d1a-8ed9215ac024",
    polarOrderId: "b97c1b60-796b-4014-8d1a-8ed9215ac024",
    promoId: "judges-2026",
    reason:
      "judges-2026 was redeemed on a Polar customer left under a stale link; its grant was revoked unseen when the customer was replaced",
    source: "pack",
    units: 300,
    userId: "GQFdU22sUO1jYi2zJ40ucTdzHhZX5zsE",
  },
  // #232: research that found no ideas kept 3 credits a run. The QA
  // accounts' charged runs on 2026-10-29, from their credits_consumed events.
  {
    environment: "next",
    id: "232-uat1-research-refund",
    reason:
      "runs 1c44d528 and b1b0278c found no ideas but kept their research credits (#232)",
    source: "pack",
    units: 6,
    userId: "kelrYQFgEtptlOMpoDPOsLDWucs4gYLK",
  },
  {
    environment: "next",
    id: "232-uat2-research-refund",
    reason: "run e4b7317e found no ideas but kept its research credits (#232)",
    source: "pack",
    units: 3,
    userId: "DRgOqrrDV1RlWipceUOSfZLX2zQURD5n",
  },
];

// The one credit period of a settlement.
export const SETTLEMENT_PERIOD = "settlement";

export const settlementGrantId = (settlement: Pick<Settlement, "id">) =>
  `settle:${settlement.id}`;

// Applies the environment's settlements. Returns the ids it credited now.
export const applySettlements = async (
  db: Database,
  environment: SettlementEnvironment,
  settlements: readonly Settlement[] = SETTLEMENTS
) => {
  const credited: string[] = [];
  for (const settlement of settlements) {
    if (settlement.environment !== environment) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    const applied = await applyGrant(db, {
      grantId: settlementGrantId(settlement),
      periodKey: SETTLEMENT_PERIOD,
      promoId: settlement.promoId,
      rollover: true,
      source: settlement.source,
      units: settlement.units,
      userId: settlement.userId,
    });
    log.info({
      billing: {
        applied,
        environment,
        polarOrderId: settlement.polarOrderId,
        reason: settlement.reason,
        settlement: settlement.id,
        units: settlement.units,
        userId: settlement.userId,
      },
    });
    if (applied) {
      credited.push(settlement.id);
    }
  }
  return credited;
};
