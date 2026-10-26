import { PostgresStore } from "@mastra/pg";
import type { Database } from "@wovain/db";
import { log } from "evlog";
import pRetry from "p-retry";

// Mastra's store on the app's database: workflow snapshots, memory threads,
// working memory, scores and traces, all in the `mastra` schema.
//
// Mastra's own lazy init rejects unhandled when Postgres is down, which can
// take the process with it. So it is off (disableInit), and the schema is
// created here in the background, retried with backoff, never throwing:
// while it is pending or after it gives up, the app serves everything but
// what needs the store (runs on the Mastra engine, memory, stored scores),
// and those calls fail as their own errors.

const ATTEMPTS = 6;

export const initStorage = async (
  storage: Pick<PostgresStore, "init">,
  { retries = ATTEMPTS, minTimeout = 1000 } = {}
): Promise<boolean> => {
  try {
    await pRetry(async () => await storage.init(), {
      minTimeout,
      onFailedAttempt: ({ attemptNumber, error }) => {
        log.warn({
          mastra: { attempt: attemptNumber, storageInit: error.message },
        });
      },
      retries,
    });
    return true;
  } catch (error) {
    log.error({
      error: "MASTRA_STORAGE_UNAVAILABLE",
      mastra: {
        storageInit: error instanceof Error ? error.message : String(error),
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
    disableInit: true,
    id: "wovain-mastra",
    pool,
    schemaName: "mastra",
  });
  // Resolves true once the schema is ready, false if it gave up; never
  // rejects. Mastra's init logs a failed connection instead of throwing, so
  // a query on the pool proves the database answered.
  const ready = initStorage({
    init: async () => {
      await storage.init();
      await pool.query("select 1 from mastra.mastra_workflow_snapshot limit 1");
    },
  });
  return { ready, storage };
};
