import { onSuccess, ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type { Context, FunnelEvent } from "./context";

const base = os.$context<Context>();

const SERVER_ERROR = 500;

// evlog's oRPC middleware logs every procedure error onto the request's wide
// event, which the app's error tracking drain reports to PostHog (4xx
// excepted), for the website and MCP alike. It marks every error event as
// error level; an expected 4xx (signed out, store not connected, no credits)
// is the caller's, so its event drops to warn. A 5xx or any other throw stays
// at error.
const clientErrorsAtWarn = base.middleware(async ({ context, next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof ORPCError && error.status < SERVER_ERROR) {
      context.log?.setLevel("warn");
    }
    throw error;
  }
});

export const publicProcedure = base
  .use(clientErrorsAtWarn)
  .use(evlog<Context>());

// A browser session or an MCP access token: either way, one merchant.
const requireAuth = base.middleware(({ context, next }) => {
  const userId = context.session?.user.id ?? context.mcpUserId;
  if (userId === undefined) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
      userId,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

// A funnel step: recorded in product analytics once the procedure succeeds,
// whether the merchant acted on the site or through ChatGPT. Sent before the
// response: Cloud Run throttles the CPU of anything left for after it, which
// is how these events used to get lost.
export const funnelProcedure = (event: FunnelEvent) =>
  protectedProcedure.use(
    // oRPC awaits this callback before it answers.
    onSuccess(async (_output, { context }) => {
      await context.analytics?.capture({
        distinctId: context.userId,
        event,
        properties: {
          via: context.mcpUserId === undefined ? "web" : "chatgpt",
        },
      });
    })
  );
