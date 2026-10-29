import { call, isProcedure, ORPCError } from "@orpc/server";
import type { AnyProcedure } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { appRouter } from "./index";

// The router's contract, procedure by procedure: who may call it and what it
// takes. Nothing here reaches a handler, so no database or provider is set up.

type Entry = [path: string, procedure: AnyProcedure];

// Every procedure, by its dotted path.
const walk = (node: object, path: string[] = []): Entry[] =>
  Object.entries(node).flatMap(([key, child]: [string, object]) =>
    isProcedure(child)
      ? [[[...path, key].join("."), child] as Entry]
      : walk(child, [...path, key])
  );

const procedures = walk(appRouter);
const PUBLIC = new Set(["healthCheck"]);
const withInput = procedures.filter(
  ([, procedure]) => procedure["~orpc"].inputSchema !== undefined
);

const anonymous = { context: { session: null } as never };
const merchant = { context: { mcpUserId: "user_1", session: null } as never };

const codeOf = async (pending: Promise<unknown>) => {
  try {
    await pending;
  } catch (error) {
    return error instanceof ORPCError ? error.code : error;
  }
  return "OK";
};

describe("appRouter contract", () => {
  it.each(procedures.filter(([path]) => !PUBLIC.has(path)))(
    "%s refuses a caller without a session or MCP token",
    async (_path, procedure) => {
      expect(await codeOf(call(procedure, undefined, anonymous))).toBe(
        "UNAUTHORIZED"
      );
    }
  );

  it.each(withInput)(
    "%s refuses input of the wrong shape before its handler runs",
    async (_path, procedure) => {
      expect(await codeOf(call(procedure, 42 as never, merchant))).toBe(
        "BAD_REQUEST"
      );
    }
  );

  it("answers the health check without a session", async () => {
    expect(await call(appRouter.healthCheck, undefined, anonymous)).toBe("OK");
  });
});
