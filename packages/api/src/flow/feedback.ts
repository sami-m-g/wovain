import { EVENTS } from "@wovain/core/events";
import {
  DEFAULT_WEIGHTS_VERSION,
  fitWeights,
  learnedOf,
  learningsOf,
  MIN_SAMPLES,
} from "@wovain/core/feedback";
import type {
  IdeaOutcome,
  LearnedResults,
  WeightFit,
} from "@wovain/core/feedback";
import { campaignInsights, shopInsights } from "@wovain/core/insights";
import type { CampaignInsight, ProductSales } from "@wovain/core/insights";
import { SCORE_TERMS, SCORE_WEIGHTS } from "@wovain/core/score";
import type { IdeaSignals, ScoreWeights } from "@wovain/core/score";
import { recordLearnings } from "@wovain/core/taste";
import { DecisionTrace } from "@wovain/core/trace";
import type { TraceSource } from "@wovain/core/trace";
import type { ResearchFeedback } from "@wovain/core/trends";
import { decisionTrace, performanceSnapshot } from "@wovain/db/schema/autonomy";
import { idea, product as productTable } from "@wovain/db/schema/seller";
import { and, desc, eq, inArray, min, sql } from "drizzle-orm";
import { createError, log } from "evlog";
import { z } from "zod";

import type { Actor } from "./actor";
import { traceSinkFor } from "./approvals";
import { listConnections, withProvider } from "./connections";
import { flagContextOf } from "./flags";

// The feedback loop (openspec feedback-loop): daily performance snapshots
// of what wovain made (Fourthwall sales per product and drop, Meta results
// per campaign and ad), each idea's outcome from them, and what that
// teaches: the merchant's re-fit score weights (a versioned decision trace)
// and learnings for taste memory and the research prompt.

const AGENT = "feedback_loop";
const WEIGHTS_STEP = "score_weights";
// Days read back on each snapshot: Meta and Fourthwall revise recent days.
export const SNAPSHOT_DAYS = 3;
// A product's outcome sums its first OUTCOME_DAYS days for sale, and a
// source's first snapshot reads back this far, so products already for sale
// have their whole window.
export const OUTCOME_DAYS = 28;
// A product counts once it has been for sale this long.
export const MIN_LIVE_DAYS = 3;
// "Check results now" reuses a fit younger than this.
export const LEARN_COOLDOWN_MS = 5 * 60_000;
// Days read from a provider at once, so a backfill stays within its limits.
const DAYS_AT_ONCE = 4;
const DAY_MS = 86_400_000;
const CENTS = 100;

type Snapshot = typeof performanceSnapshot.$inferInsert;
type Source = "fourthwall" | "meta";

// What the loop reads and writes with: the app's database, or the
// transaction a fit runs in.
interface Store {
  db: Pick<Actor["db"], "execute" | "insert" | "query" | "select">;
  userId: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** The last `count` UTC days, oldest first, ending today. */
export const lastDays = (count: number, now = new Date()) =>
  Array.from({ length: count }, (_, index) =>
    isoDay(new Date(now.getTime() - (count - 1 - index) * DAY_MS))
  );

// Runs `work` on each item, DAYS_AT_ONCE at a time, in order.
const inBatches = async <T, R>(
  items: T[],
  work: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = [];
  for (let at = 0; at < items.length; at += DAYS_AT_ONCE) {
    // Batches run one after another on purpose: providers rate-limit.
    // oxlint-disable-next-line no-await-in-loop
    const batch = await Promise.all(
      items.slice(at, at + DAYS_AT_ONCE).map(work)
    );
    results.push(...batch);
  }
  return results;
};

const cents = (dollars: number) => Math.round(dollars * CENTS);

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Every error reaches PostHog Error Tracking: the loop goes on without the
// part that failed.
const logFailure = (
  code: string,
  error: unknown,
  context: Record<string, unknown>
) => {
  log.error({
    error: {
      code,
      message: reasonOf(error),
      name: "FeedbackLoopError",
      ...(error instanceof Error && error.stack !== undefined
        ? { stack: error.stack }
        : {}),
    },
    feedback: context,
  });
};

export const feedbackLoopOff = () =>
  createError({
    fix: "Turn on the feedback-loop flag for this environment.",
    message: "The feedback loop isn't available yet",
    status: 404,
    why: "The feedback-loop flag is off.",
  });

export const feedbackLoopOn = async (actor: Actor) =>
  await actor.core.flags.isOn("feedback-loop", flagContextOf(actor));

export const requireFeedbackLoop = async (actor: Actor) => {
  if (!(await feedbackLoopOn(actor))) {
    throw feedbackLoopOff();
  }
};

// What wovain made for the merchant: runs → designs → products → campaigns.
const loadMade = async ({ db, userId }: Store) =>
  await db.query.run.findMany({
    where: { userId },
    with: {
      designs: { with: { products: { with: { campaigns: true } } } },
    },
  });

export type Made = Awaited<ReturnType<typeof loadMade>>;
type Product = Made[number]["designs"][number]["products"][number];

// Fourthwall's report names a product by its title, which is the design's.
const productsByTitle = (made: Made) => {
  const byTitle = new Map<string, Product>();
  for (const design of made.flatMap((run) => run.designs)) {
    const [first] = design.products.toSorted(
      (a, b) => Number(b.status === "public") - Number(a.status === "public")
    );
    if (first !== undefined) {
      byTitle.set(design.brief.title.toLowerCase(), first);
    }
  }
  return byTitle;
};

/** One day of Fourthwall sales as product and drop rows. */
export const shopRows = (
  userId: string,
  made: Made,
  date: string,
  sales: ProductSales[]
): Snapshot[] => {
  const byTitle = productsByTitle(made);
  const sold = new Map<string, ProductSales>();
  for (const item of sales) {
    const product = byTitle.get(item.name.toLowerCase());
    if (product !== undefined) {
      sold.set(product.id, item);
    }
  }
  const rows: Snapshot[] = [];
  for (const run of made) {
    const published = run.designs
      .flatMap((design) => design.products)
      .filter((product) => product.status === "public");
    if (published.length === 0) {
      continue;
    }
    let units = 0;
    let revenueCents = 0;
    let orders = 0;
    let withSales = 0;
    for (const product of published) {
      const item = sold.get(product.id);
      const productUnits = item?.unitsSold ?? 0;
      units += productUnits;
      revenueCents += cents(item?.revenue ?? 0);
      orders += item?.orders ?? 0;
      withSales += productUnits > 0 ? 1 : 0;
      rows.push({
        date,
        entityId: product.offerId,
        level: "product",
        productId: product.id,
        purchases: item?.orders ?? 0,
        raw: item ?? null,
        revenueCents: cents(item?.revenue ?? 0),
        source: "fourthwall",
        units: productUnits,
        userId,
      });
    }
    rows.push({
      date,
      entityId: run.id,
      level: "drop",
      purchases: orders,
      // Sell-through: published products with at least one sale.
      raw: { published: published.length, sold: withSales },
      revenueCents,
      source: "fourthwall",
      units,
      userId,
    });
  }
  return rows;
};

/** One day of Meta results as campaign or ad rows. */
export const adRows = (
  userId: string,
  date: string,
  level: "ad" | "campaign",
  results: CampaignInsight[],
  productOf: Map<string, string>
): Snapshot[] =>
  results.map((item) => {
    const spendCents = cents(item.spend);
    return {
      clicks: Math.round(item.clicks),
      date,
      entityId: item.id,
      impressions: Math.round(item.impressions),
      level,
      productId: productOf.get(item.id) ?? null,
      raw: {
        cpa: item.cpa ?? null,
        cpc: item.clicks > 0 ? item.spend / item.clicks : null,
        ctr: item.ctr ?? null,
        name: item.name,
        results: item.results,
        roas: item.roas ?? null,
      },
      // Purchase value from Meta's ROAS; 0 when the pixel reports none.
      revenueCents: item.roas === undefined ? 0 : cents(item.roas * item.spend),
      source: "meta",
      spendCents,
      userId,
    };
  });

const UPSERTED = [
  "clicks",
  "impressions",
  "product_id",
  "purchases",
  "raw",
  "revenue_cents",
  "spend_cents",
  "units",
] as const;

// Upserts on (user, source, level, entity, day): a rerun overwrites.
const saveRows = async (actor: Pick<Actor, "db">, rows: Snapshot[]) => {
  if (rows.length === 0) {
    return [];
  }
  return await actor.db
    .insert(performanceSnapshot)
    .values(rows)
    .onConflictDoUpdate({
      set: {
        ...Object.fromEntries(
          UPSERTED.map((column) => [column, sql.raw(`excluded.${column}`)])
        ),
        updatedAt: new Date(),
      },
      target: [
        performanceSnapshot.userId,
        performanceSnapshot.source,
        performanceSnapshot.level,
        performanceSnapshot.entityId,
        performanceSnapshot.date,
      ],
    })
    .returning({ id: performanceSnapshot.id });
};

const dayRange = (date: string) => ({
  from: `${date}T00:00:00.000Z`,
  to: new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS).toISOString(),
});

const fourthwallRows = async (actor: Actor, made: Made, days: string[]) =>
  await withProvider(actor, "fourthwall", async (call) => {
    const perDay = await inBatches(days, async (date) => {
      const shop = await shopInsights(call, dayRange(date));
      return shopRows(actor.userId, made, date, shop.products);
    });
    return perDay.flat();
  });

const metaRows = async (actor: Actor, made: Made, days: string[]) => {
  const campaigns = made.flatMap((run) =>
    run.designs.flatMap((design) =>
      design.products.flatMap((item) => item.campaigns)
    )
  );
  if (campaigns.length === 0) {
    return [];
  }
  const productOf = new Map<string, string>();
  const byAccount = new Map<string, { ads: string[]; campaigns: string[] }>();
  for (const staged of campaigns) {
    productOf.set(staged.metaCampaignId, staged.productId);
    for (const adId of staged.adIds) {
      productOf.set(adId, staged.productId);
    }
    const account = byAccount.get(staged.adAccountId) ?? {
      ads: [],
      campaigns: [],
    };
    account.campaigns.push(staged.metaCampaignId);
    account.ads.push(...staged.adIds);
    byAccount.set(staged.adAccountId, account);
  }
  return await withProvider(actor, "meta", async (call) => {
    const perDay = await inBatches(days, async (date) => {
      const reads = await Promise.all(
        [...byAccount].flatMap(([adAccountId, ids]) =>
          (["campaign", "ad"] as const).map(async (level) => {
            const objectIds = level === "ad" ? ids.ads : ids.campaigns;
            if (objectIds.length === 0) {
              return [];
            }
            const results = await campaignInsights(call, {
              adAccountId,
              campaignIds: objectIds,
              day: date,
              level,
              range: "7d",
            });
            return adRows(actor.userId, date, level, results, productOf);
          })
        )
      );
      return reads.flat();
    });
    return perDay.flat();
  });
};

export interface SnapshotResult {
  failed: Source[];
  saved: { fourthwall: number; meta: number };
}

const notify = async (
  actor: Actor,
  source: Source,
  date: string,
  snapshotIds: string[]
) => {
  if (actor.events === undefined || snapshotIds.length === 0) {
    return;
  }
  try {
    await actor.events.send({
      data: { date, snapshotIds, source, userId: actor.userId },
      name: EVENTS.performanceSnapshot,
    });
  } catch (error) {
    logFailure("FEEDBACK_EVENT_FAILED", error, { source });
  }
};

/** Each source's first snapshot day: its rows cover every day since. */
export const coverageOf = async (
  store: Store
): Promise<Partial<Record<Source, string>>> => {
  const rows = await store.db
    .select({
      from: min(performanceSnapshot.date),
      source: performanceSnapshot.source,
    })
    .from(performanceSnapshot)
    .where(eq(performanceSnapshot.userId, store.userId))
    .groupBy(performanceSnapshot.source);
  return Object.fromEntries(
    rows.flatMap(({ from, source }) =>
      from === null ? [] : [[source, from] as const]
    )
  );
};

/**
 * The days a snapshot reads: the last SNAPSHOT_DAYS once a source has rows.
 * A source's first snapshot reads back to the oldest public product, at
 * most OUTCOME_DAYS, so products already for sale get their whole window.
 */
export const daysToRead = (
  made: Made,
  coveredFrom: string | undefined,
  now = new Date()
) => {
  if (coveredFrom !== undefined) {
    return lastDays(SNAPSHOT_DAYS, now);
  }
  const launched = made
    .flatMap((run) => run.designs.flatMap((design) => design.products))
    .filter((item) => item.status === "public")
    .map((item) => Date.parse(`${isoDay(item.createdAt)}T00:00:00.000Z`));
  if (launched.length === 0) {
    return lastDays(SNAPSHOT_DAYS, now);
  }
  const today = Date.parse(`${isoDay(now)}T00:00:00.000Z`);
  const back = Math.round((today - Math.min(...launched)) / DAY_MS) + 1;
  return lastDays(Math.min(Math.max(back, SNAPSHOT_DAYS), OUTCOME_DAYS), now);
};

/**
 * Saves the results for what wovain made: the last SNAPSHOT_DAYS, or a
 * backfill on a source's first snapshot (daysToRead). Each provider settles
 * on its own: a failure is logged and the other one saves.
 */
export const snapshotPerformance = async (
  actor: Actor,
  now = new Date()
): Promise<SnapshotResult> => {
  const [made, connections, covered] = await Promise.all([
    loadMade(actor),
    listConnections(actor),
    coverageOf(actor),
  ]);
  const result: SnapshotResult = {
    failed: [],
    saved: { fourthwall: 0, meta: 0 },
  };
  const sources = [
    { provider: "fourthwall" as const, read: fourthwallRows },
    { provider: "meta" as const, read: metaRows },
  ].filter(({ provider }) =>
    connections.some((item) => item.provider === provider)
  );
  await Promise.all(
    sources.map(async ({ provider, read }) => {
      try {
        const days = daysToRead(made, covered[provider], now);
        const saved = await saveRows(actor, await read(actor, made, days));
        result.saved[provider] = saved.length;
        await notify(
          actor,
          provider,
          isoDay(now),
          saved.map((row) => row.id)
        );
      } catch (error) {
        result.failed.push(provider);
        logFailure("FEEDBACK_SNAPSHOT_FAILED", error, {
          provider,
          user_id: actor.userId,
        });
      }
    })
  );
  return result;
};

const signalsSchema = z.looseObject({
  affinity: z.number().optional(),
  ipSafety: z.number(),
  margin: z.number(),
  marketHits: z.number(),
  newsHits: z.number(),
  recency: z.number(),
  relevance: z.number(),
});

interface SnapshotSums {
  clicks: number;
  impressions: number;
  revenueCents: number;
  spendCents: number;
  units: number;
}

/**
 * Each idea's outcome: the sums of its products' sales and their campaigns'
 * results over each product's first OUTCOME_DAYS for sale. An idea counts
 * once a public product has been for sale MIN_LIVE_DAYS, and only products
 * the sales snapshots cover from their first day (`salesFrom`) count: a
 * product launched before them would read as unsold.
 */
export const outcomesOf = (
  made: Made,
  ideas: { id: string; signals: IdeaSignals; theme: string }[],
  sums: { sales: Map<string, SnapshotSums>; ads: Map<string, SnapshotSums> },
  salesFrom: string | undefined,
  now = new Date()
): IdeaOutcome[] => {
  if (salesFrom === undefined) {
    return [];
  }
  const liveBefore = now.getTime() - MIN_LIVE_DAYS * DAY_MS;
  const productsOf = new Map<string, Product[]>();
  for (const design of made.flatMap((run) => run.designs)) {
    const live = design.products.filter(
      (item) =>
        item.status === "public" &&
        item.createdAt.getTime() <= liveBefore &&
        isoDay(item.createdAt) >= salesFrom
    );
    productsOf.set(design.ideaId, [
      ...(productsOf.get(design.ideaId) ?? []),
      ...live,
    ]);
  }
  return ideas.flatMap((item) => {
    const products = productsOf.get(item.id) ?? [];
    if (products.length === 0) {
      return [];
    }
    const total = (map: Map<string, SnapshotSums>, key: keyof SnapshotSums) =>
      products.reduce((sum, live) => sum + (map.get(live.id)?.[key] ?? 0), 0);
    return [
      {
        clicks: total(sums.ads, "clicks"),
        ideaId: item.id,
        impressions: total(sums.ads, "impressions"),
        revenueCents: total(sums.sales, "revenueCents"),
        signals: item.signals,
        spendCents: total(sums.ads, "spendCents"),
        theme: item.theme,
        units: total(sums.sales, "units"),
      },
    ];
  });
};

// Sums per product over its first OUTCOME_DAYS days for sale (UTC).
const windowSums = async (
  store: Store,
  source: Source,
  level: "campaign" | "product"
) => {
  const launched = sql`(${productTable.createdAt})::date`;
  const rows = await store.db
    .select({
      clicks: sql<number>`coalesce(sum(${performanceSnapshot.clicks}), 0)::int`,
      impressions: sql<number>`coalesce(sum(${performanceSnapshot.impressions}), 0)::int`,
      productId: performanceSnapshot.productId,
      revenueCents: sql<number>`coalesce(sum(${performanceSnapshot.revenueCents}), 0)::int`,
      spendCents: sql<number>`coalesce(sum(${performanceSnapshot.spendCents}), 0)::int`,
      units: sql<number>`coalesce(sum(${performanceSnapshot.units}), 0)::int`,
    })
    .from(performanceSnapshot)
    .innerJoin(productTable, eq(productTable.id, performanceSnapshot.productId))
    .where(
      and(
        eq(performanceSnapshot.userId, store.userId),
        eq(performanceSnapshot.source, source),
        eq(performanceSnapshot.level, level),
        sql`${performanceSnapshot.date} >= ${launched}`,
        sql`${performanceSnapshot.date} < ${launched} + ${OUTCOME_DAYS}::int`
      )
    )
    .groupBy(performanceSnapshot.productId);
  return new Map(
    rows.flatMap(({ productId, ...sums }) =>
      productId === null
        ? []
        : [
            [
              productId,
              {
                clicks: Number(sums.clicks),
                impressions: Number(sums.impressions),
                revenueCents: Number(sums.revenueCents),
                spendCents: Number(sums.spendCents),
                units: Number(sums.units),
              },
            ] as const,
          ]
    )
  );
};

const loadOutcomes = async (store: Store, now: Date) => {
  const made = await loadMade(store);
  const ideaIds = [
    ...new Set(
      made.flatMap((run) => run.designs.map((design) => design.ideaId))
    ),
  ];
  if (ideaIds.length === 0) {
    return [];
  }
  const [rows, sales, ads, covered] = await Promise.all([
    store.db
      .select({ id: idea.id, research: idea.research, theme: idea.theme })
      .from(idea)
      .where(and(eq(idea.userId, store.userId), inArray(idea.id, ideaIds))),
    windowSums(store, "fourthwall", "product"),
    windowSums(store, "meta", "campaign"),
    coverageOf(store),
  ]);
  const ideas = rows.flatMap((row) => {
    const parsed = signalsSchema.safeParse(row.research.signals);
    return parsed.success
      ? [{ id: row.id, signals: parsed.data, theme: row.theme }]
      : [];
  });
  return outcomesOf(made, ideas, { ads, sales }, covered.fourthwall, now);
};

/** A saved fit: the trace output of a score_weights step. */
export interface WeightsRecord extends WeightFit {
  learned: LearnedResults;
}

const weightsSchema = z.object(
  Object.fromEntries(SCORE_TERMS.map((term) => [term, z.number()])) as Record<
    keyof ScoreWeights,
    z.ZodNumber
  >
);

const resultSchema = z.object({
  ctr: z.number().optional(),
  ideaId: z.string(),
  revenueCents: z.number(),
  theme: z.string(),
  units: z.number(),
});

const recordSchema = z.object({
  changed: z.boolean(),
  correlations: weightsSchema,
  learned: z.object({
    sold: z.array(resultSchema),
    unsold: z.array(resultSchema),
  }),
  samples: z.number(),
  version: z.number(),
  weights: weightsSchema,
});

/** The merchant's newest fit, or undefined before the first. */
export const latestFit = async (store: Store) => {
  const [row] = await store.db
    .select({ at: decisionTrace.at, output: decisionTrace.output })
    .from(decisionTrace)
    .where(
      and(
        eq(decisionTrace.userId, store.userId),
        eq(decisionTrace.agent, AGENT),
        eq(decisionTrace.step, WEIGHTS_STEP),
        eq(decisionTrace.ok, true)
      )
    )
    .orderBy(desc(decisionTrace.at), desc(decisionTrace.seq))
    .limit(1);
  const parsed = recordSchema.safeParse(row?.output);
  return row !== undefined && parsed.success
    ? { at: row.at, record: parsed.data as WeightsRecord }
    : undefined;
};

const versionOf = (fit: Awaited<ReturnType<typeof latestFit>>) =>
  fit === undefined
    ? DEFAULT_WEIGHTS_VERSION
    : {
        samples: fit.record.samples,
        version: fit.record.version,
        weights: fit.record.weights,
      };

const writeMemory = async (actor: Actor, learned: LearnedResults) => {
  const { memory } = actor.core;
  if (memory === undefined) {
    return;
  }
  try {
    await recordLearnings(memory, {
      learned: learningsOf(learned),
      userId: actor.userId,
    });
  } catch (error) {
    logFailure("FEEDBACK_MEMORY_FAILED", error, { user_id: actor.userId });
  }
};

const sourcesOf = (snapshot: SnapshotResult): TraceSource[] => [
  ...(snapshot.saved.fourthwall > 0
    ? [{ provider: "fourthwall" as const, title: "Sales by product" }]
    : []),
  ...(snapshot.saved.meta > 0
    ? [{ provider: "meta" as const, title: "Campaign and ad insights" }]
    : []),
];

// One fit at a time per merchant: the daily run and "Check results now"
// read the latest version and write the next, so they take turns. The lock
// ends with the transaction.
const lockFits = async (store: Store) => {
  await store.db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${AGENT}:${store.userId}`}))`
  );
};

/**
 * The whole loop for one merchant: snapshot, outcomes, re-fit (a new
 * version only on a change), the decision trace, and taste memory. The fit
 * and its trace run in one transaction under a per-merchant lock, so two
 * fits never share a version.
 */
export const learnFromResults = async (actor: Actor, now = new Date()) => {
  const snapshot = await snapshotPerformance(actor, now);
  const { fit, record } = await actor.db.transaction(async (tx) => {
    const store: Store = { db: tx, userId: actor.userId };
    await lockFits(store);
    const [outcomes, previous] = await Promise.all([
      loadOutcomes(store, now),
      latestFit(store),
    ]);
    const fitted = fitWeights(outcomes, versionOf(previous));
    const saved: WeightsRecord = { ...fitted, learned: learnedOf(outcomes) };
    const trace = new DecisionTrace(
      { userId: actor.userId },
      traceSinkFor(store),
      () => now
    );
    trace.add({
      agent: AGENT,
      inputSummary: `Last ${SNAPSHOT_DAYS} days from ${
        Object.entries(snapshot.saved)
          .filter(([, count]) => count > 0)
          .map(([provider]) => provider)
          .join(" and ") || "no provider"
      }`,
      ok: snapshot.failed.length === 0,
      output: snapshot,
      sources: sourcesOf(snapshot),
      step: "snapshot",
    });
    trace.add({
      agent: AGENT,
      inputSummary: `${outcomes.length} ideas for sale ${MIN_LIVE_DAYS}+ days, each over its first ${OUTCOME_DAYS} days`,
      output: saved,
      sources: [{ provider: "rule", title: "Bounded weight fit" }],
      step: WEIGHTS_STEP,
    });
    await trace.flush();
    return { fit: fitted, record: saved };
  });
  await writeMemory(actor, record.learned);
  actor.log?.set({
    feedback: {
      samples: fit.samples,
      snapshot,
      version: fit.version,
    },
  });
  return { record, snapshot };
};

/** The weights and learnings research uses, when the loop is on. */
export const researchFeedbackOf = async (
  actor: Actor
): Promise<ResearchFeedback | undefined> => {
  if (!(await feedbackLoopOn(actor))) {
    return undefined;
  }
  const fit = await latestFit(actor);
  return fit === undefined
    ? undefined
    : {
        learned: learningsOf(fit.record.learned),
        weights: fit.record.weights,
      };
};

/** "What we learned": the newest fit against the defaults. */
export const whatWeLearned = async (actor: Actor) => {
  const fit = await latestFit(actor);
  const record = fit?.record;
  return {
    defaults: SCORE_WEIGHTS as ScoreWeights,
    fittedAt: fit?.at,
    learned: record?.learned ?? { sold: [], unsold: [] },
    minLiveDays: MIN_LIVE_DAYS,
    minSamples: MIN_SAMPLES,
    samples: record?.samples ?? 0,
    version: record?.version ?? 0,
    weights: record?.weights ?? (SCORE_WEIGHTS as ScoreWeights),
  };
};

/**
 * "Check results now": a fresh snapshot and fit, unless the last fit is
 * younger than LEARN_COOLDOWN_MS, then what we learned.
 */
export const learnOnDemand = async (actor: Actor, now = new Date()) => {
  const last = await latestFit(actor);
  const fresh =
    last !== undefined && now.getTime() - last.at.getTime() < LEARN_COOLDOWN_MS;
  if (!fresh) {
    await learnFromResults(actor, now);
  }
  return await whatWeLearned(actor);
};
