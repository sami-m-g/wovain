import { byDesign, ledger } from "@wovain/shared/optimizer/ledger";
import type { LedgerLine } from "@wovain/shared/optimizer/ledger";
import { change } from "@wovain/shared/optimizer/math";
import { opsFindings, refundSpike } from "@wovain/shared/optimizer/ops";
import { designFindings } from "@wovain/shared/optimizer/pod";
import {
  blocksFrom,
  checkClicks,
  checkFindings,
  checkPurchases,
  checkRevenue,
  checkTrend,
  checkUtmCoverage,
} from "@wovain/shared/optimizer/reconcile";
import type { Check } from "@wovain/shared/optimizer/reconcile";
import { entityKey } from "@wovain/shared/optimizer/records";
import type { Block, Entity, Finding } from "@wovain/shared/optimizer/records";
import {
  campaignRules,
  shopWide,
  trackingGap,
} from "@wovain/shared/optimizer/shop";
import type { Snapshot } from "@wovain/shared/optimizer/snapshot";
import type { Settings } from "@wovain/shared/settings";

import {
  adFactsOf,
  ancestorsFor,
  campaignFactsOf,
  designFactsOf,
  flatten,
  ledgerSalesByAd,
  orderFactsOf,
  settledClock,
  stockFactsOf,
  total,
} from "./facts.ts";
import type { Rows } from "./facts.ts";
import type { Wovain } from "./sources/wovain.ts";

// Triage (spec section 3): code only, every run. The facts from 30 days of
// snapshots go through the reconciliation checks R1 to R5 and every POD
// rule; failed R1 or R2 checks open kill blocks. The store then compares
// the findings with the open ones, and only a new or changed finding sends
// the run on to a review.

const DAY = 86_400_000;
const META = /facebook|instagram|meta|fb|ig/iu;
const shop: Entity = { id: "shop", kind: "shop" };

export interface Triage {
  ancestorsOf: (entity: Entity) => Entity[];
  blocks: Block[];
  checks: Check[];
  findings: Finding[];
}

// R1 per ad and for the campaign, on Meta days that have settled.
const purchaseChecks = (
  rows: Rows,
  ads: ReturnType<typeof adFactsOf>[],
  {
    campaignId,
    settings,
    settledMeta,
  }: {
    campaignId: string | undefined;
    settings: Settings;
    settledMeta: (row: Rows["adDays"][number]) => boolean;
  }
) => {
  const { disagreementPct } = settings.optimizer;
  const perAd = ads.map((ad) => {
    const settled = rows.adDays.filter(
      (row) => row.adId === ad.adId && settledMeta(row)
    );
    return checkPurchases({
      disagreementPct,
      entity: { id: ad.adId, kind: "ad" },
      metaPurchases: total(settled, (row) => row.purchases),
      netSales: ad.netSales,
      settled: settled.length > 0,
    });
  });
  const campaign =
    campaignId === undefined
      ? []
      : [
          checkPurchases({
            disagreementPct,
            entity: { id: campaignId, kind: "campaign" },
            metaPurchases: total(
              rows.adDays.filter(settledMeta),
              (row) => row.purchases
            ),
            netSales: total(ads, (ad) => ad.netSales),
            settled: rows.adDays.some(settledMeta),
          }),
        ];
  return [...perAd, ...campaign];
};

// R2: Meta link clicks and Fourthwall's sessions from Meta over the same 7
// days. Skipped when the sessions report wasn't read.
const clickCheck = (
  rows: Rows,
  campaignId: string | undefined,
  now: number
) => {
  const sessions = rows.funnel.find((row) => row.source === "meta");
  if (sessions === undefined || campaignId === undefined) {
    return [];
  }
  const since = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const clicks = total(
    rows.adDays.filter((row) => row.date >= since),
    (row) => row.clicks
  );
  return [
    checkClicks({
      clicks,
      entity: { id: campaignId, kind: "campaign" },
      sessions: sessions.sessions,
    }),
  ];
};

// R3: of the orders a webhook saw with a Meta UTM source, how many carry
// an ad id. R4: the ledger against Fourthwall's profit report on the same
// days. R5: the niche against the shop's sales, last week over the one before.
const shopChecks = (rows: Rows, designs: Wovain["designs"], now: number) => {
  const fromMeta = rows.orders.filter((order) =>
    META.test(order.utmSource ?? "")
  );
  const profitDays = new Set(rows.profit.map((row) => row.date));
  const onProfitDays = rows.orders.filter((order) =>
    profitDays.has(new Date(order.at).toISOString().slice(0, 10))
  );
  const perSale = designs[0]?.quote.breakevenPerSale ?? 0;
  const lines = ledger(onProfitDays, rows.reversals, () => "shop").get("shop");
  const week = (from: number, to: number) =>
    rows.orders.filter(
      (order) => order.at >= now - from * DAY && order.at < now - to * DAY
    ).length;
  const [trend] = rows.trends;
  return [
    checkUtmCoverage({
      entity: shop,
      metaSourcedSales: fromMeta.length,
      withAdId: fromMeta.filter((order) => order.adId !== undefined).length,
    }),
    ...(rows.profit.length > 0 && lines !== undefined
      ? [
          checkRevenue({
            entity: shop,
            ledgerProfit: lines.netSales * perSale - lines.reversalCost,
            reportedProfit: total(rows.profit, (row) => row.profit),
          }),
        ]
      : []),
    ...(trend === undefined
      ? []
      : [
          checkTrend({
            entity: shop,
            nicheChangePct: trend.changePct,
            salesAfter: week(7, 0),
            salesBefore: week(14, 7),
          }),
        ]),
  ];
};

// Kill blocks: a failing R1 or R2 opens one (keeping the original `since`
// and any reason the merchant gave); a block lifts only when its check
// passes again. A check that couldn't run this time keeps its block.
export const nextBlocks = (
  open: Block[],
  checks: Check[],
  now: number
): Block[] => {
  const status = new Map(
    checks.map((check) => [
      `${check.id}:${entityKey(check.entity)}`,
      check.status,
    ])
  );
  const kept = open.filter(
    (block) => status.get(`${block.check}:${block.entityKey}`) !== "pass"
  );
  const keys = new Set(
    kept.map((block) => `${block.check}:${block.entityKey}`)
  );
  return [
    ...kept,
    ...blocksFrom(checks, now).filter(
      (block) => !keys.has(`${block.check}:${block.entityKey}`)
    ),
  ];
};

// POD-O2 on a design with orders, against the shop's rate.
const refundsOf = (
  design: { productId: string },
  line: LedgerLine | undefined,
  shopLine: LedgerLine | undefined,
  settings: Settings
) =>
  line === undefined || shopLine === undefined
    ? []
    : refundSpike(design.productId, line, shopLine, settings);

// Each design's sales last week against the week before (POD-S3).
const designChanges = (rows: Rows, designs: Wovain["designs"], now: number) =>
  designs.flatMap((design) => {
    const sold = (from: number, to: number) =>
      rows.orders.filter(
        (order) =>
          order.designId === design.id &&
          order.at >= now - from * DAY &&
          order.at < now - to * DAY
      ).length;
    const moved = change(sold(14, 7), sold(7, 0));
    return moved === undefined ? [] : [moved];
  });

// One finding per pattern and entity (two checks can raise the same one).
const dedupe = (findings: Finding[]) => [
  ...new Map(
    findings.map((finding) => [
      `${finding.pattern}:${entityKey(finding.entity)}`,
      finding,
    ])
  ).values(),
];

export const triage = ({
  blocks,
  now,
  promotionActive,
  snapshots,
  wovain,
}: {
  blocks: Block[];
  now: number;
  promotionActive: boolean;
  snapshots: Snapshot[];
  wovain: Wovain;
}): Triage => {
  const { campaign, designs, settings } = wovain;
  const rows = flatten(snapshots);
  const clock = settledClock(settings, now);
  const settledOrders = rows.orders.filter(clock.order);
  const input = {
    actions: wovain.actions,
    clock,
    ledgerSales: ledgerSalesByAd(settledOrders, rows.reversals),
    rows,
  };
  const ads = rows.metaAds.map((ad) => adFactsOf(ad, input));
  const names = new Map(rows.metaAds.map((ad) => [ad.adId, ad.name]));
  const designFacts = designs.map((design) =>
    designFactsOf(design, ads, { names, orders: settledOrders })
  );
  const campaignId = campaign?.campaignId;
  const campaignFacts = campaignFactsOf(
    rows.campaigns.find((row) => row.campaignId === campaignId),
    { designs: designFacts, orders: settledOrders }
  );
  const checks = [
    ...purchaseChecks(rows, ads, {
      campaignId,
      settings,
      settledMeta: clock.meta,
    }),
    ...clickCheck(rows, campaignId, now),
    ...shopChecks(rows, designs, now),
  ];
  const recent = rows.orders.filter((order) => order.at >= now - 30 * DAY);
  const designLines = ledger(recent, rows.reversals, byDesign);
  const shopLine = ledger(recent, rows.reversals, () => "shop").get("shop");
  const ops = designFacts.flatMap((design, index) => [
    ...opsFindings(
      stockFactsOf(design, {
        actions: wovain.actions,
        colors: designs[index]?.colors.map((color) => color.name) ?? [],
        orders: recent,
        stock: rows.stock,
      }),
      orderFactsOf(design.productId, {
        fulfillment: rows.fulfillment,
        now,
        reversals: rows.reversals,
      })
    ),
    ...refundsOf(design, designLines.get(design.designId), shopLine, settings),
  ]);
  const r1Failed = checks.some(
    (check) => check.id === "R1" && check.status === "fail"
  );
  const findings = [
    ...designFacts.flatMap((design) => designFindings(design, now, settings)),
    ...(campaignFacts === undefined
      ? []
      : campaignRules(campaignFacts, settings)),
    ...ops,
    ...checkFindings(checks),
    // CAPI event counts aren't read until Meta connects through wovain
    // (MR 7), so only a failing R1 raises the tracking gap here.
    ...trackingGap(1, r1Failed),
    ...shopWide(designChanges(rows, designs, now), promotionActive),
  ];
  return {
    ancestorsOf: ancestorsFor(names, campaignId, wovain.designOf),
    blocks: nextBlocks(blocks, checks, now),
    checks,
    findings: dedupe(findings),
  };
};
