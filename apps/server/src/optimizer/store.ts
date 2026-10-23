import { storedEventSchema } from "@wovain/shared/optimizer/events";
import type { StoredEvent } from "@wovain/shared/optimizer/events";
import {
  findingKey,
  findingRecordSchema,
  runSchema,
  stateSchema,
} from "@wovain/shared/optimizer/records";
import type { Finding, OptimizerState } from "@wovain/shared/optimizer/records";
import {
  mergeSnapshot,
  snapshotSchema,
} from "@wovain/shared/optimizer/snapshot";
import type { Snapshot, SnapshotRows } from "@wovain/shared/optimizer/snapshot";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isAlreadyExists } from "../lib/tasks.ts";
import { EVENT_TTL_MS, optimizerDocs } from "./docs.ts";

// One merchant's optimizer records (spec section 8), read and written only
// here, each checked against its zod shape on read. Every path is under
// users/{uid}/optimization/state, so one merchant never reads another's.

const DAY = 86_400_000;
// Firestore's limit on the ids one `in` query takes.
const IN_LIMIT = 30;

export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);

const ttl = (at: number) => Timestamp.fromMillis(at + EVENT_TTL_MS);

// Firestore create(): false when the key was stored before. Shared by the
// webhook intake and the reconciliation poll, so an event is kept once
// whichever path saw it first.
export const storeEventOnce = async (
  db: Firestore,
  uid: string,
  event: StoredEvent
) => {
  try {
    await optimizerDocs(db)
      .events(uid)
      .doc(event.key)
      .create({ ...event, expiresAt: ttl(event.receivedAt), pending: true });
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) {
      return false;
    }
    throw error;
  }
};

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  );

const cacheSchema = z.object({ at: z.int(), value: z.unknown() });

type FindingRecord = z.infer<typeof findingRecordSchema>;
type Run = z.infer<typeof runSchema>;

// What a triage changed: findings first seen, ones whose numbers moved, and
// ones a later run no longer sees.
export interface FindingDiff {
  changed: FindingRecord[];
  closed: FindingRecord[];
  open: FindingRecord[];
  opened: FindingRecord[];
}

const sameFinding = (a: Finding, b: Finding) =>
  JSON.stringify([a.facts, a.settled]) === JSON.stringify([b.facts, b.settled]);

export const createOptimizationStore = (db: Firestore, uid: string) => {
  const docs = optimizerDocs(db);

  const state = async (): Promise<OptimizerState> => {
    const doc = await docs.state(uid).get();
    return stateSchema.parse(doc.data() ?? {});
  };

  const patchState = async (patch: Partial<OptimizerState>) => {
    await docs.state(uid).set(patch, { merge: true });
  };

  // Unprocessed events, oldest first.
  const pendingEvents = async (limit: number): Promise<StoredEvent[]> => {
    const found = await docs
      .events(uid)
      .where("pending", "==", true)
      .limit(limit)
      .get();
    return found.docs
      .flatMap((doc) => {
        const parsed = storedEventSchema.safeParse(doc.data());
        return parsed.success ? [parsed.data] : [];
      })
      .toSorted((a, b) => a.receivedAt - b.receivedAt);
  };

  const markProcessed = async (keys: string[], at: number) => {
    await Promise.all(
      chunks(keys, 400).map(async (part) => {
        const batch = db.batch();
        for (const key of part) {
          batch.update(docs.events(uid).doc(key), {
            pending: FieldValue.delete(),
            processedAt: at,
          });
        }
        await batch.commit();
      })
    );
  };

  // Folds rows into each day's snapshot, one transaction per day.
  const addRows = async (byDay: Map<string, SnapshotRows>, at: number) => {
    await Promise.all(
      [...byDay].map(async ([date, rows]) => {
        const ref = docs.snapshots(uid).doc(date);
        await db.runTransaction(async (tx) => {
          const doc = await tx.get(ref);
          const current = snapshotSchema.parse({ ...doc.data(), date });
          tx.set(ref, {
            ...mergeSnapshot(current, rows),
            expiresAt: ttl(Date.parse(date) + DAY),
            updatedAt: at,
          });
        });
      })
    );
  };

  // The last `days` days' snapshots, oldest first.
  const snapshots = async (now: number, days = 30): Promise<Snapshot[]> => {
    const found = await docs
      .snapshots(uid)
      .where("date", ">=", dayOf(now - days * DAY))
      .get();
    return found.docs
      .flatMap((doc) => {
        const parsed = snapshotSchema.safeParse(doc.data());
        return parsed.success ? [parsed.data] : [];
      })
      .toSorted((a, b) => a.date.localeCompare(b.date));
  };

  const openFindings = async (): Promise<FindingRecord[]> => {
    const found = await docs.findings(uid).where("status", "==", "open").get();
    return found.docs.flatMap((doc) => {
      const parsed = findingRecordSchema.safeParse(doc.data());
      return parsed.success ? [parsed.data] : [];
    });
  };

  // Saves this run's findings against the open ones: new ones open, moved
  // ones update, missing ones close.
  const saveFindings = async (
    findings: Finding[],
    at: number
  ): Promise<FindingDiff> => {
    const current = await openFindings();
    const before = new Map(current.map((f) => [f.id, f]));
    const diff: FindingDiff = { changed: [], closed: [], open: [], opened: [] };
    const batch = db.batch();
    for (const finding of findings) {
      const id = findingKey(finding);
      const old = before.get(id);
      before.delete(id);
      const record = {
        ...finding,
        id,
        openedAt: old?.openedAt ?? at,
        status: "open" as const,
      };
      diff.open.push(record);
      if (old === undefined || !sameFinding(old, finding)) {
        (old === undefined ? diff.opened : diff.changed).push(record);
        batch.set(docs.findings(uid).doc(encodeURIComponent(id)), record);
      }
    }
    for (const old of before.values()) {
      const closed = { ...old, closedAt: at, status: "closed" as const };
      diff.closed.push(closed);
      batch.set(docs.findings(uid).doc(encodeURIComponent(old.id)), closed);
    }
    await batch.commit();
    return diff;
  };

  const saveRun = async (run: Run) => {
    await docs.runs(uid).doc(run.id).set(runSchema.parse(run));
  };

  const latestRun = async (): Promise<Run | undefined> => {
    const found = await docs
      .runs(uid)
      .orderBy("startedAt", "desc")
      .limit(1)
      .get();
    const [first] = found.docs;
    const parsed = runSchema.safeParse(first?.data());
    return parsed.success ? parsed.data : undefined;
  };

  // A value read at most once per `ttlMs` (analytics reports are daily
  // aggregates, so an hour is fresh enough). Nothing is cached when the load
  // gives nothing.
  const cached = async <T>(
    key: string,
    { at, schema, ttlMs }: { at: number; schema: z.ZodType<T>; ttlMs: number },
    load: () => Promise<T | undefined>
  ): Promise<T | undefined> => {
    const ref = docs.cache(uid).doc(key);
    const doc = await ref.get();
    const hit = cacheSchema.safeParse(doc.data());
    const value = hit.success ? schema.safeParse(hit.data.value) : undefined;
    if (hit.success && value?.success === true && at - hit.data.at < ttlMs) {
      return value.data;
    }
    const loaded = await load();
    if (loaded !== undefined) {
      await ref.set({ at, expiresAt: ttl(at), value: loaded });
    }
    return loaded;
  };

  // Which of these event keys are stored already.
  const knownEvents = async (keys: string[]) => {
    const found = await Promise.all(
      chunks(keys, IN_LIMIT).map(
        async (part) =>
          await db.getAll(...part.map((key) => docs.events(uid).doc(key)))
      )
    );
    return new Set(found.flat().flatMap((doc) => (doc.exists ? [doc.id] : [])));
  };

  return {
    addRows,
    cached,
    knownEvents,
    latestRun,
    markProcessed,
    openFindings,
    patchState,
    pendingEvents,
    saveFindings,
    saveRun,
    snapshots,
    state,
    storeEvent: async (event: StoredEvent) =>
      await storeEventOnce(db, uid, event),
  };
};

export type OptimizationStore = ReturnType<typeof createOptimizationStore>;
