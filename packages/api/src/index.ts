import { ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type { Context } from "./context";

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
