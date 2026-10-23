import { z } from "zod";

import type { Env } from "../env.ts";
import type { Storage } from "../firebase.ts";
import type { Cipher } from "../lib/cipher.ts";
import { qlooFor } from "../lib/qloo.ts";
import { cloudTasks, memoryTasks, verifyTaskToken } from "../lib/tasks.ts";
import type { TaskQueue } from "../lib/tasks.ts";
import type { Upstream } from "../lib/upstream.ts";
import { createIntake } from "./intake.ts";
import { callerFor } from "./read.ts";
import { createRunner, runReasons } from "./run.ts";
import type { Runner } from "./run.ts";
import { createScheduler } from "./schedule.ts";
import { createTrendSource } from "./sources/trends.ts";

const reasonSchema = z.enum(runReasons);

// The optimizer's server side: webhook intake, its task queue and the run
// handler. With WOVAIN_OPTIMIZER_QUEUE set, tasks go to Cloud Tasks;
// otherwise (`pnpm dev`) they run in this process at their scheduled time.
export const createOptimizer = (
  env: Env,
  { db, media }: Storage,
  cipher: Cipher | undefined,
  upstream?: Upstream
) => {
  const queue = env.WOVAIN_OPTIMIZER_QUEUE;
  const serviceAccount = env.WOVAIN_TASKS_SERVICE_ACCOUNT;
  // In-process tasks call the runner, which itself enqueues tasks.
  const local: { run?: Runner["run"] } = {};
  const tasks: TaskQueue =
    queue === undefined || serviceAccount === undefined
      ? memoryTasks(async ({ body }) => {
          const { uid } = body;
          const reason = reasonSchema.safeParse(body["reason"]).data ?? "event";
          return typeof uid === "string"
            ? await local.run?.(uid, reason)
            : undefined;
        })
      : cloudTasks({ queue, serviceAccount, site: env.WOVAIN_SITE_URL });
  const runner = createRunner({
    db,
    media,
    readerFor: (uid, count) => callerFor(upstream, uid, count),
    tasks,
    trends: createTrendSource(db, qlooFor(env.QLOO_API_KEY)),
  });
  local.run = runner.run;
  return {
    db,
    intake: createIntake({
      cipher,
      customerKey: env.OPTIMIZER_CUSTOMER_KEY,
      db,
      debounceSeconds: env.WOVAIN_OPTIMIZER_DEBOUNCE_SECONDS,
      fourthwallAppKey: env.FOURTHWALL_APP_HMAC_KEY,
      metaAppSecret: env.META_APP_SECRET,
      tasks,
    }),
    metaVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
    runner,
    scheduler: createScheduler({ db, tasks }),
    tasks,
    verify: async (authorization: string | undefined, audience: string) =>
      await verifyTaskToken({ audience, authorization, serviceAccount }),
  };
};

export type Optimizer = ReturnType<typeof createOptimizer>;
