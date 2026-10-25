import { onSuccess, ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type { Context, FunnelEvent } from "./context";

const base = os.$context<Context>();

export const publicProcedure = base.use(evlog<Context>());

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
