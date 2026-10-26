import { createRouterClient, ORPCError } from "@orpc/server";
import type { Context } from "@wovain/api/context";
import { publicProcedure } from "@wovain/api/index";
import { describe, expect, it, vi } from "vitest";

// Procedure errors reach PostHog Error Tracking through the context's
// analytics, except the ones a procedure means to return.
const setup = (session: Context["session"] = null) => {
  const captureException = vi.fn();
  const failure = new Error("upstream down");
  const router = {
    crash: publicProcedure.handler(() => {
      throw failure;
    }),
    internal: publicProcedure.handler(() => {
      throw new ORPCError("INTERNAL_SERVER_ERROR");
    }),
    missing: publicProcedure.handler(() => {
      throw new ORPCError("NOT_FOUND");
    }),
    tooMany: publicProcedure.handler(() => {
      throw new ORPCError("TOO_MANY_REQUESTS");
    }),
  };
  const client = createRouterClient(router, {
    context: {
      analytics: { capture: vi.fn(), captureException },
      session,
    } as unknown as Context,
  });
  return { captureException, client, failure };
};

describe("procedure error tracking", () => {
  it("reports an unexpected error with the merchant's id and procedure", async () => {
    const { captureException, client, failure } = setup({
      user: { email: "merchant@example.com", id: "user_1" },
    } as Context["session"]);
    await expect(client.crash()).rejects.toBe(failure);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(failure, {
      distinctId: "user_1",
      properties: { procedure: "crash" },
    });
  });

  it("reports an undefined 5xx anonymously without a session", async () => {
    const { captureException, client } = setup();
    await expect(client.internal()).rejects.toThrow();
    expect(captureException).toHaveBeenCalledOnce();
    expect(captureException.mock.calls[0]?.[1]).toEqual({
      distinctId: undefined,
      properties: { procedure: "internal" },
    });
  });

  it.each(["missing", "tooMany"] as const)(
    "doesn't report the expected %s error",
    async (procedure) => {
      const { captureException, client } = setup();
      await expect(client[procedure]()).rejects.toBeInstanceOf(ORPCError);
      expect(captureException).not.toHaveBeenCalled();
    }
  );
});
