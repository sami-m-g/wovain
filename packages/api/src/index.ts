import { ORPCError, os } from "@orpc/server";
import { evlog } from "evlog/orpc";

import type { Context } from "./context";

const base = os.$context<Context>();

export const publicProcedure = base.use(evlog<Context>());

const requireAuth = base.middleware(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
