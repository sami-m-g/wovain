import { change, ratio } from "./math.ts";
import { entityKey } from "./records.ts";
import type { Block, Entity, Evidence, Finding } from "./records.ts";

// The reconciliation checks R1 to R5 (spec section 3, Reconcile), one entity
// and one settled window at a time. Shop and Meta numbers are compared, never
// added. A failed R1 or R2 blocks kills on the entity until it passes again.

export const reconcileRuleIds = {
  R1: "code: checkPurchases",
  R2: "code: checkClicks",
  R3: "code: checkUtmCoverage",
  R4: "code: checkRevenue",
  R5: "code: checkTrend",
} as const;
type CheckId = keyof typeof reconcileRuleIds;

export interface Check {
  entity: Entity;
  evidence: Evidence[];
  id: CheckId;
  // Unknown: too little data, or the window hasn't settled.
  status: "pass" | "fail" | "unknown";
}

const statusOf = (failed: boolean | undefined): Check["status"] => {
  if (failed === undefined) {
    return "unknown";
  }
  return failed ? "fail" : "pass";
};

const check = (
  id: CheckId,
  entity: Entity,
  failed: boolean | undefined,
  evidence: Evidence[]
): Check => ({ entity, evidence, id, status: statusOf(failed) });

// R1: Meta purchases vs net sales from utm_source=meta, same settled window.
// Fails past `disagreementPct` and at least 2 sales apart.
export const checkPurchases = ({
  disagreementPct,
  entity,
  metaPurchases,
  netSales,
  settled,
}: {
  disagreementPct: number;
  entity: Entity;
  metaPurchases: number;
  netSales: number;
  settled: boolean;
}) => {
  const gap = Math.abs(metaPurchases - netSales);
  const share = ratio(gap, Math.max(metaPurchases, netSales)) ?? 0;
  return check(
    "R1",
    entity,
    settled ? gap >= 2 && share * 100 > disagreementPct : undefined,
    [
      { label: "Meta purchases", source: "meta", value: metaPurchases },
      { label: "Net sales from Meta", source: "fourthwall", value: netSales },
    ]
  );
};

// R2: Meta link clicks vs Fourthwall sessions from Meta. Fewer sessions than
// half the clicks means stripped UTMs or a slow or broken page.
export const checkClicks = ({
  clicks,
  entity,
  sessions,
}: {
  clicks: number;
  entity: Entity;
  sessions: number;
}) =>
  check("R2", entity, clicks > 0 ? sessions < clicks / 2 : undefined, [
    { label: "Meta link clicks", source: "meta", value: clicks },
    { label: "Sessions from Meta", source: "fourthwall", value: sessions },
  ]);

// R3: under 80% of Meta-sourced sales carry an ad id in utm_content.
export const checkUtmCoverage = ({
  entity,
  metaSourcedSales,
  withAdId,
}: {
  entity: Entity;
  metaSourcedSales: number;
  withAdId: number;
}) => {
  const coverage = ratio(withAdId, metaSourcedSales);
  return check(
    "R3",
    entity,
    coverage === undefined ? undefined : coverage < 0.8,
    [
      {
        label: "Sales from Meta",
        source: "fourthwall",
        value: metaSourcedSales,
      },
      { label: "With an ad id", source: "fourthwall", value: withAdId },
    ]
  );
};

// R4: the ledger's contribution vs Fourthwall's profit report, same days.
export const checkRevenue = ({
  entity,
  ledgerProfit,
  reportedProfit,
}: {
  entity: Entity;
  ledgerProfit: number;
  reportedProfit: number;
}) => {
  const off = ratio(
    Math.abs(ledgerProfit - reportedProfit),
    Math.abs(reportedProfit)
  );
  return check("R4", entity, off === undefined ? undefined : off > 0.1, [
    { label: "Ledger contribution", source: "computed", value: ledgerProfit },
    { label: "Profit report", source: "fourthwall", value: reportedProfit },
  ]);
};

// R5: the niche and the shop's sales move the same way past `moveThreshold`
// (default 20%): the swing is market-wide, not one ad's doing.
export const checkTrend = ({
  entity,
  nicheChangePct,
  salesAfter,
  salesBefore,
  moveThreshold = 0.2,
}: {
  entity: Entity;
  moveThreshold?: number;
  nicheChangePct: number;
  salesAfter: number;
  salesBefore: number;
}) => {
  const shop = change(salesBefore, salesAfter);
  const niche = nicheChangePct / 100;
  const moved = (value: number) => Math.abs(value) >= moveThreshold;
  return check(
    "R5",
    entity,
    shop === undefined
      ? undefined
      : moved(shop) && moved(niche) && Math.sign(shop) === Math.sign(niche),
    [
      { label: "Niche change %", source: "trends", value: nicheChangePct },
      { label: "Shop sales change", source: "computed", value: shop ?? 0 },
    ]
  );
};

const patternOf = {
  R1: "source_disagreement",
  R2: "source_disagreement",
  R3: "tracking_gap",
  R4: "source_disagreement",
  R5: "trend_shift",
} as const;

// A failed check as a finding.
export const checkFindings = (checks: Check[]): Finding[] =>
  checks.flatMap((item) =>
    item.status === "fail"
      ? [
          {
            entity: item.entity,
            evidence: item.evidence,
            facts: {},
            pattern: patternOf[item.id],
            rule: item.id,
            settled: true,
          },
        ]
      : []
  );

// The kill blocks a set of checks opens: one per failed R1 or R2.
export const blocksFrom = (checks: Check[], now: number): Block[] =>
  checks.flatMap((item) =>
    item.status === "fail" && (item.id === "R1" || item.id === "R2")
      ? [{ check: item.id, entityKey: entityKey(item.entity), since: now }]
      : []
  );

// A kill on `target` is blocked by an open block on it or on anything above it
// (its design, its campaign, the shop). A block the merchant dismissed with a
// reason no longer counts.
export const isKillBlocked = (
  target: Entity,
  ancestors: Entity[],
  blocks: Block[]
) => {
  const keys = new Set([target, ...ancestors].map(entityKey));
  return blocks.some(
    (block) => block.dismissedReason === undefined && keys.has(block.entityKey)
  );
};
