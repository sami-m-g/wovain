import {
  optimizerDueSchema,
  stateSchema,
} from "@wovain/shared/optimizer/records";
import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

import { taskName } from "../lib/tasks.ts";
import type { TaskQueue } from "../lib/tasks.ts";
import { optimizerDocs } from "./docs.ts";

// One optimizer run for one merchant, as a Cloud Task. A 120 s lease on
// the merchant's state keeps runs from overlapping; a run that finds the
// lease held tries again a minute later. For now a run only marks the
// events it took as processed: observe, triage and review come later
// (plan MRs 4 to 6).

const LEASE_MS = 120_000;
const RETRY_MS = 60_000;
// Events taken per run; a fuller backlog gets a follow-up task.
const BATCH = 400;

export type RunResult =
  | { kind: "busy" }
  | { kind: "disabled" }
  | { kind: "done"; processed: number };

interface RunDeps {
  db: Firestore;
  now?: () => number;
  tasks: TaskQueue;
}

export const createRunner = ({ db, now = Date.now, tasks }: RunDeps) => {
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
      const state = stateSchema.parse(doc.data() ?? {});
      if ((state.leaseUntil ?? 0) > now()) {
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

  const markProcessed = async (uid: string) => {
    const pending = await docs
      .events(uid)
      .where("pending", "==", true)
      .limit(BATCH)
      .get();
    const batch = db.batch();
    for (const doc of pending.docs) {
      batch.update(doc.ref, {
        pending: FieldValue.delete(),
        processedAt: now(),
      });
    }
    await batch.commit();
    return pending.size;
  };

  const run = async (uid: string): Promise<RunResult> => {
    if (!(await enabled(uid))) {
      return { kind: "disabled" };
    }
    if (!(await lease(uid))) {
      await later(uid, "retry", RETRY_MS);
      return { kind: "busy" };
    }
    try {
      const processed = await markProcessed(uid);
      if (processed === BATCH) {
        await later(uid, "more", 0);
      }
      return { kind: "done", processed };
    } finally {
      await docs
        .state(uid)
        .set({ lastRunAt: now(), leaseUntil: 0 }, { merge: true });
    }
  };

  return { run };
};

export type Runner = ReturnType<typeof createRunner>;
