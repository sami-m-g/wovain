import { PostgresStore } from "@mastra/pg";
import type { Database } from "@wovain/db";
import { log } from "evlog";
import pRetry from "p-retry";

// Mastra's store on the app's database: workflow snapshots, memory threads,
// working memory, scores and traces, all in the `mastra` schema.
//
// The schema is created at deploy time, never by the app: the migrate jobs
// (.gitlab/ci/deploy.yml) run `initMastraSchema` (./storage-init.ts) after
// Drizzle's migrations, with Mastra's own `init()`. At runtime the store
// has disableInit, so Mastra never runs DDL on first use (its lazy init
// rejects unhandled when Postgres is down, which can take the process with
// it), and `init()` is a no-op there. The app only checks, in the
// background, that the schema answers; until it does, the agents run
// without memory (@wovain/core/nemotron) and the failure is logged.

export const MASTRA_STORE = { id: "wovain-mastra", schemaName: "mastra" };

// The tables a run needs: workflow snapshots and memory threads.
const PROBES = [
  "select 1 from mastra.mastra_workflow_snapshot limit 1",
  "select 1 from mastra.mastra_threads limit 1",
];

type Pool = Pick<Database["$client"], "query">;

const probe = async (pool: Pool) => {
  for (const sql of PROBES) {
    // Sequential on purpose: the first missing table is the error.
    // oxlint-disable-next-line no-await-in-loop
    await pool.query(sql);
  }
};

const ATTEMPTS = 6;

// Resolves true once the check passes, false if it gave up; never rejects.
export const checkStorage = async (
  check: () => Promise<unknown>,
  { retries = ATTEMPTS, minTimeout = 1000 } = {}
): Promise<boolean> => {
  try {
    await pRetry(async () => await check(), {
      minTimeout,
      onFailedAttempt: ({ attemptNumber, error }) => {
        log.warn({
          mastra: { attempt: attemptNumber, storageCheck: error.message },
        });
      },
      retries,
    });
    return true;
  } catch (error) {
    log.error({
      error: "MASTRA_STORAGE_UNAVAILABLE",
      mastra: {
        fix: "Run the migrate job: it creates the mastra schema (pnpm --filter @wovain/api storage:init).",
        storageCheck: error instanceof Error ? error.message : String(error),
      },
    });
    return false;
  }
};

export const createMastraStorage = (pool: Database["$client"]) => {
  // An idle client's error (Postgres restarting, a dropped connection) is an
  // 'error' event on the pool, which crashes Node when nothing listens.
  if (pool.listenerCount("error") === 0) {
    pool.on("error", (error) => {
      log.error({
        error: "POSTGRES_POOL_ERROR",
        postgres: { message: error.message },
      });
    });
  }
  const storage = new PostgresStore({
    ...MASTRA_STORE,
    disableInit: true,
    pool,
  });
  const ready = checkStorage(async () => await probe(pool));
  return { ready, storage };
};

// Creates or updates the `mastra` schema and its tables with Mastra's own
// init (no hand-written DDL), then checks the tables a run needs. Throws on
// any failure, so the deploy stops before an app that can't remember.
export const initMastraSchema = async (connectionString: string) => {
  const store = new PostgresStore({ ...MASTRA_STORE, connectionString });
  try {
    await store.init();
    await probe(store.pool);
  } finally {
    await store.close();
  }
};
