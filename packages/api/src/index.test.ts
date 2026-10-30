import { call, ORPCError } from "@orpc/server";
import { createError, createLogger, initLogger } from "evlog";
import type { RequestLogger } from "evlog";
import { beforeAll, expect, test } from "vitest";

import type { Context } from "./context";
import { protectedProcedure, publicProcedure } from "./index";

beforeAll(() => {
  initLogger({ silent: true });
});

// The wide event's level once a procedure has thrown, as the RPC route
// would emit it.
const levelAfter = async (
  procedure: typeof publicProcedure | typeof protectedProcedure,
  thrown?: unknown
) => {
  const log = createLogger() as RequestLogger;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the fields the middlewares read
  const context = { log, session: null } as unknown as Context;
  await expect(
    call(
      procedure.handler(() => {
        throw thrown;
      }),
      undefined,
      { context }
    )
  ).rejects.toBeDefined();
  return log.emit()?.level;
};

// QA 2026-10-29 #6: `POST /api/rpc/store/readiness (409)` was logged at ERROR.
test("an expected 4xx is logged at warn", async () => {
  await expect(
    levelAfter(publicProcedure, new ORPCError("CONFLICT", { status: 409 }))
  ).resolves.toBe("warn");
  await expect(
    levelAfter(
      publicProcedure,
      new ORPCError("PAYMENT_REQUIRED", { status: 402 })
    )
  ).resolves.toBe("warn");
  await expect(
    levelAfter(
      publicProcedure,
      createError({ message: "Not connected", status: 409 })
    )
  ).resolves.toBe("warn");
});

test("a signed-out call to a protected procedure is logged at warn", async () => {
  await expect(levelAfter(protectedProcedure)).resolves.toBe("warn");
});

test("a 5xx or any other throw stays at error", async () => {
  await expect(
    levelAfter(publicProcedure, new ORPCError("INTERNAL_SERVER_ERROR"))
  ).resolves.toBe("error");
  await expect(
    levelAfter(publicProcedure, new Error("database down"))
  ).resolves.toBe("error");
});
