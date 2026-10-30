import { setTimeout as wait } from "node:timers/promises";

import { createDb } from "@wovain/db";
import { Inngest } from "inngest";
import { describe, expect, it, vi } from "vitest";

import { createMastra } from "./engine";
import { RUN_WORKFLOW_ID } from "./run";
import type { RunServices } from "./run";
import { checkStorage, createMastraStorage, initMastraSchema } from "./storage";

describe("Mastra storage boot", () => {
  it("retries a failing check, then gives up without throwing", async () => {
    const check = vi.fn(async () => {
      await Promise.resolve();
      throw new Error("connect ECONNREFUSED");
    });

    await expect(
      checkStorage(check, { minTimeout: 1, retries: 2 })
    ).resolves.toBe(false);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it("succeeds once Postgres answers", async () => {
    let calls = 0;
    const check = vi.fn(async () => {
      calls += 1;
      await Promise.resolve();
      if (calls < 2) {
        throw new Error("the database system is starting up");
      }
    });

    await expect(
      checkStorage(check, { minTimeout: 1, retries: 3 })
    ).resolves.toBe(true);
  });

  it("boots with Postgres down: no unhandled rejection, no crash", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    // Nothing listens on port 1.
    const { $client: pool } = createDb({
      DATABASE_URL: "postgres://wovain@127.0.0.1:1/none?connect_timeout=1",
    });

    const { ready, storage } = createMastraStorage(pool);
    // The app's Mastra instance on that store: the run workflow, tracing
    // and the score exporter, as apps/web builds it.
    const mastra = createMastra({
      cloudTrace: false,
      inngest: new Inngest({ id: "wovain-test" }),
      services: {
        core: { agents: undefined },
        db: createDb({ DATABASE_URL: "postgres://wovain@127.0.0.1:1/none" }),
      } as unknown as RunServices,
      storage,
    });
    expect(mastra.getWorkflow(RUN_WORKFLOW_ID)).toBeDefined();
    const settled = await Promise.race([ready, wait(1500, "pending" as const)]);

    expect(storage).toBeDefined();
    // Still retrying in the background, or given up: never thrown.
    expect([false, "pending"]).toContain(settled);
    expect(rejections).toEqual([]);
    process.off("unhandledRejection", onRejection);
    await pool.end();
  });

  it("fails the deploy-time init when the schema can't be created", async () => {
    await expect(
      initMastraSchema("postgres://wovain@127.0.0.1:1/none?connect_timeout=1")
    ).rejects.toThrow();
  });
});
