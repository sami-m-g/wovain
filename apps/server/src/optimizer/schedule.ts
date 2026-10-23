import type { Firestore } from "firebase-admin/firestore";

import { taskName } from "../lib/tasks.ts";
import type { TaskQueue } from "../lib/tasks.ts";
import { optimizerDocs } from "./docs.ts";

// The scheduler jobs' fan-out (spec section 6). Every 15 minutes, each
// enabled merchant with a campaign delivering in the last 24 hours gets one
// poll run, named for its slot so a doubled tick queues nothing twice. Every
// hour, merchants whose review hour it is get their daily sweep, named for
// the date. optimizerDue holds only flags, no merchant data.

const SLOT_MS = 15 * 60_000;
// Merchants per tick; the next tick picks up the rest.
const LIMIT = 200;

export const createScheduler = ({
  db,
  now = Date.now,
  tasks,
}: {
  db: Firestore;
  now?: () => number;
  tasks: TaskQueue;
}) => {
  const docs = optimizerDocs(db);

  const enqueueAll = async (
    uids: string[],
    reason: "poll" | "daily",
    key: number | string
  ) => {
    const queued = await Promise.all(
      uids.map(
        async (uid) =>
          await tasks.enqueue({
            body: { reason, uid },
            name: taskName(uid, reason, key),
            path: "/tasks/optimizer/run",
          })
      )
    );
    return queued.filter(Boolean).length;
  };

  // Polling stops by itself: activeUntil moves only while Meta shows delivery.
  const pollTick = async () => {
    const at = now();
    const due = await docs
      .dues()
      .where("enabled", "==", true)
      .where("activeUntil", ">", at)
      .limit(LIMIT)
      .get();
    return await enqueueAll(
      due.docs.map((doc) => doc.id),
      "poll",
      Math.floor(at / SLOT_MS)
    );
  };

  const dailyTick = async () => {
    const at = now();
    const due = await docs
      .dues()
      .where("enabled", "==", true)
      .where("reviewHourUtc", "==", new Date(at).getUTCHours())
      .limit(LIMIT)
      .get();
    return await enqueueAll(
      due.docs.map((doc) => doc.id),
      "daily",
      new Date(at).toISOString().slice(0, 10)
    );
  };

  return { dailyTick, pollTick };
};

export type Scheduler = ReturnType<typeof createScheduler>;
