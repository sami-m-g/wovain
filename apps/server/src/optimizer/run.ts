import { optimizerDueSchema } from "@wovain/shared/optimizer/records";
import {
  mergeSnapshot,
  snapshotSchema,
} from "@wovain/shared/optimizer/snapshot";
import type { Snapshot, SnapshotRows } from "@wovain/shared/optimizer/snapshot";
import type { Firestore } from "firebase-admin/firestore";

import { taskName } from "../lib/tasks.ts";
import type { TaskQueue } from "../lib/tasks.ts";
import { createStore } from "../store.ts";
import type { Media } from "../store.ts";
import { createCollector } from "./collect.ts";
import type { Polled } from "./collect.ts";
import { optimizerDocs } from "./docs.ts";
import {
  lastStatuses,
  missedEvents,
  rowsFromEvents,
  rowsFromPolls,
} from "./observe.ts";
import { createQuota } from "./quota.ts";
import type { Reader } from "./read.ts";
import type { TrendSource } from "./sources/trends.ts";
import { readWovain } from "./sources/wovain.ts";
import type { Wovain } from "./sources/wovain.ts";
import { createOptimizationStore } from "./store.ts";
import type { FindingDiff, OptimizationStore } from "./store.ts";
import { triage } from "./triage.ts";
import type { Triage } from "./triage.ts";

// One optimizer run for one merchant, as a Cloud Task. A 120 s lease on the
// merchant's state keeps runs from overlapping; a run that finds it held
// tries again a minute later. A run observes (stored events, and on a poll
// or the daily sweep the merchant's Fourthwall and Meta), folds what it saw
// into the day's snapshot, triages it with code, and hands new or changed
// findings to the review (MR 5). Every run is saved with what it read.

const LEASE_MS = 120_000;
const RETRY_MS = 60_000;
// Events taken per run; a fuller backlog gets a follow-up task.
const BATCH = 400;

export const runReasons = [
  "event",
  "poll",
  "daily",
  "review",
  "retry",
  "more",
] as const;
export type RunReason = (typeof runReasons)[number];

export type RunResult =
  | { kind: "busy" }
  | { kind: "disabled" }
  | { kind: "limited" }
  | {
      kind: "done";
      missed: number;
      opened: number;
      processed: number;
      reviewed: boolean;
    };

// What a run hands to the review: the findings code raised and the store's
// comparison with the open ones.
interface ReviewInput {
  diff: FindingDiff;
  now: number;
  reason: RunReason;
  runId: string;
  store: OptimizationStore;
  triage: Triage;
  uid: string;
  wovain: Wovain;
}
type Review = (input: ReviewInput) => Promise<{ steps: string[] }>;

interface RunDeps {
  db: Firestore;
  media: Media;
  now?: () => number;
  review?: Review | undefined;
  tasks: TaskQueue;
  trends?: TrendSource | undefined;
  // How a run reads one merchant's accounts (read.ts callerFor).
  readerFor: Reader;
}

const NOT_POLLED: Polled = {};

// Rows for each day from several observations, merged by key.
const merge = (...maps: Map<string, SnapshotRows>[]) => {
  const merged = new Map<string, Snapshot>();
  for (const [day, rows] of maps.flatMap((map) => [...map])) {
    const current = merged.get(day) ?? snapshotSchema.parse({ date: day });
    merged.set(day, mergeSnapshot(current, rows));
  }
  return new Map(
    [...merged].map(([day, { date: _date, ...rows }]) => [day, rows])
  );
};

export const createRunner = ({
  db,
  media,
  now = Date.now,
  review,
  tasks,
  trends,
  readerFor,
}: RunDeps) => {
  const docs = optimizerDocs(db);

  const enabled = async (uid: string) => {
    const doc = await docs.due(uid).get();
    return doc.exists && optimizerDueSchema.parse(doc.data()).enabled;
  };

  // True when this run took the lease.
  const lease = async (uid: string) =>
    await db.runTransaction(async (tx) => {
      const ref = docs.state(uid);
      const doc = await tx.get(ref);
      const leaseUntil: unknown = doc.data()?.["leaseUntil"];
      if (typeof leaseUntil === "number" && leaseUntil > now()) {
        return false;
      }
      tx.set(ref, { leaseUntil: now() + LEASE_MS }, { merge: true });
      return true;
    });

  const later = async (uid: string, kind: string, delayMs: number) => {
    await tasks.enqueue({
      body: { reason: kind, uid },
      name: taskName(uid, kind, Math.floor(now() / RETRY_MS)),
      path: "/tasks/optimizer/run",
      scheduleAt: now() + delayMs,
    });
  };

  const { poll, record, trendRows } = createCollector({
    db,
    now,
    readerFor,
    trends,
  });

  const observe = async (
    uid: string,
    reason: RunReason,
    store: OptimizationStore,
    wovain: Wovain
  ) => {
    const polling =
      reason === "poll" || reason === "daily" || reason === "review";
    const [events, polled, before, trend] = await Promise.all([
      store.pendingEvents(BATCH),
      polling ? poll(uid, store, wovain) : Promise.resolve(NOT_POLLED),
      store.snapshots(now()),
      trendRows(uid, wovain, reason === "daily"),
    ]);
    const fromEvents = rowsFromEvents(events, wovain.designOf, now());
    const missed =
      polled.fourthwall === undefined
        ? []
        : missedEvents(polled.fourthwall, lastStatuses(before), now());
    const stored = await Promise.all(
      missed.map(async (event) =>
        (await store.storeEvent(event)) ? event.key : undefined
      )
    );
    const fresh = stored.filter((key) => key !== undefined);
    await store.addRows(
      merge(
        fromEvents.rows,
        rowsFromPolls(polled.fourthwall, polled.meta, now()),
        trend
      ),
      now()
    );
    await store.markProcessed(
      [...events.map((event) => event.key), ...fresh],
      now()
    );
    await record(uid, store, { ...polled, metaActive: fromEvents.metaActive });
    return {
      events,
      missed: fresh.length,
      promotionActive: fromEvents.promotionActive,
    };
  };

  const work = async (uid: string, reason: RunReason) => {
    const store = createOptimizationStore(db, uid);
    const runId = `${String(now())}-${reason}`;
    const startedAt = now();
    const wovain = await readWovain(createStore(db, media, uid));
    const observed = await observe(uid, reason, store, wovain);
    // Triage reads the snapshots and state observe just wrote.
    // oxlint-disable-next-line react-doctor/server-sequential-independent-await
    const [state, snapshots] = await Promise.all([
      store.state(),
      store.snapshots(now()),
    ]);
    const result = triage({
      blocks: state.blocks,
      now: now(),
      promotionActive: observed.promotionActive,
      snapshots,
      wovain,
    });
    const diff = await store.saveFindings(result.findings, now());
    await store.patchState({ blocks: result.blocks });
    // Triage before the model: nothing new or changed means no review, except
    // when the merchant asked for one.
    const due =
      diff.opened.length + diff.changed.length > 0 || reason === "review";
    const reviewed =
      due && review !== undefined
        ? await review({
            diff,
            now: now(),
            reason,
            runId,
            store,
            triage: result,
            uid,
            wovain,
          })
        : undefined;
    await store.saveRun({
      errors: [],
      events: observed.events.map((event) => event.key).slice(0, 400),
      finishedAt: now(),
      id: runId,
      modelReplies: [],
      overrides: [],
      reason,
      startedAt,
      status: "done",
      steps: ["observe", "triage", ...(reviewed?.steps ?? [])],
    });
    if (observed.events.length === BATCH) {
      await later(uid, "more", 0);
    }
    return {
      kind: "done" as const,
      missed: observed.missed,
      opened: diff.opened.length,
      processed: observed.events.length,
      reviewed: reviewed !== undefined,
    };
  };

  const run = async (
    uid: string,
    reason: RunReason = "event"
  ): Promise<RunResult> => {
    if (!(await enabled(uid))) {
      return { kind: "disabled" };
    }
    if (!(await lease(uid))) {
      await later(uid, "retry", RETRY_MS);
      return { kind: "busy" };
    }
    try {
      // Past the day's run limit, events wait in the store for tomorrow.
      if (!(await createQuota(db, uid, now).take("runs"))) {
        return { kind: "limited" };
      }
      return await work(uid, reason);
    } finally {
      await docs
        .state(uid)
        .set({ lastRunAt: now(), leaseUntil: 0 }, { merge: true });
    }
  };

  return { run };
};

export type Runner = ReturnType<typeof createRunner>;
