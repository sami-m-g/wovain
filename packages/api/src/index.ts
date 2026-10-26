import { onError, onSuccess, ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type { Context, FunnelEvent } from "./context";

const base = os.$context<Context>();

// oRPC turns a thrown error into a response, so Next's onRequestError never
// sees it: unexpected errors go to error tracking here, for the website and
// MCP alike. Errors a procedure means to return (a defined error, or any
// 4xx such as NOT_FOUND, UNAUTHORIZED, failed validation or a rate limit)
// are not reported.
const isUnexpectedError = (error: unknown): boolean =>
  !(error instanceof ORPCError) || (!error.defined && error.status >= 500);

export const publicProcedure = base
  .use(
    onError((failure, { context, path }) => {
      if (isUnexpectedError(failure)) {
        context.analytics?.captureException(failure, {
          distinctId: context.session?.user.id ?? context.mcpUserId,
          properties: { procedure: path.join(".") },
        });
      }
    })
  )
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
// whether the merchant acted on the site or through ChatGPT.
export const funnelProcedure = (event: FunnelEvent) =>
  protectedProcedure.use(
    onSuccess((_output, { context }) => {
      context.analytics?.capture({
        distinctId: context.userId,
        event,
        properties: {
          via: context.mcpUserId === undefined ? "web" : "chatgpt",
        },
      });
    })
  );
