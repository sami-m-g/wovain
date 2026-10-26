import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { billingRouter } from "./billing";
import { connectionsRouter } from "./connections";
import {
  campaignsRouter,
  designsRouter,
  ideasRouter,
  productsRouter,
  runsRouter,
} from "./seller";

export const appRouter = {
  billing: billingRouter,
  campaigns: campaignsRouter,
  connections: connectionsRouter,
  designs: designsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  ideas: ideasRouter,
  products: productsRouter,
  runs: runsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
