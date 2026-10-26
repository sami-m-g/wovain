import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { connectionsRouter } from "./connections";
import { insightsRouter } from "./insights";
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
  insights: insightsRouter,
  products: productsRouter,
  runs: runsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
