import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { connectionsRouter } from "./connections";
import {
  campaignsRouter,
  designsRouter,
  ideasRouter,
  productsRouter,
  runsRouter,
} from "./seller";

export const appRouter = {
  campaigns: campaignsRouter,
  connections: connectionsRouter,
  designs: designsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  ideas: ideasRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  products: productsRouter,
  runs: runsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
