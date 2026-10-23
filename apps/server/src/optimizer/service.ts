import type { Firestore } from "firebase-admin/firestore";

import type { Env } from "../env.ts";
import type { Cipher } from "../lib/cipher.ts";
import { cloudTasks, memoryTasks, verifyTaskToken } from "../lib/tasks.ts";
import type { TaskQueue } from "../lib/tasks.ts";
import { createIntake } from "./intake.ts";
import { createRunner } from "./run.ts";
import type { Runner } from "./run.ts";

// The optimizer's server side: webhook intake, its task queue and the run
// handler. With WOVAIN_OPTIMIZER_QUEUE set, tasks go to Cloud Tasks;
// otherwise (`pnpm dev`) they run in this process at their scheduled time.
export const createOptimizer = (
  env: Env,
  db: Firestore,
  cipher: Cipher | undefined
) => {
  const queue = env.WOVAIN_OPTIMIZER_QUEUE;
  const serviceAccount = env.WOVAIN_TASKS_SERVICE_ACCOUNT;
  // In-process tasks call the runner, which itself enqueues tasks.
  const local: { run?: Runner["run"] } = {};
  const tasks: TaskQueue =
    queue === undefined || serviceAccount === undefined
      ? memoryTasks(async ({ body }) => {
          const { uid } = body;
          return typeof uid === "string" ? await local.run?.(uid) : undefined;
        })
      : cloudTasks({ queue, serviceAccount, site: env.WOVAIN_SITE_URL });
  const runner = createRunner({ db, tasks });
  local.run = runner.run;
  return {
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
    verify: async (authorization: string | undefined, audience: string) =>
      await verifyTaskToken({ audience, authorization, serviceAccount }),
  };
};

export type Optimizer = ReturnType<typeof createOptimizer>;
